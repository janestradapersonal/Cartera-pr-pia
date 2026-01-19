from fastapi import FastAPI, HTTPException, Depends, Request
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Boolean
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.dialects.postgresql import JSONB
from passlib.context import CryptContext
import stripe
import json
from fastapi.middleware.cors import CORSMiddleware
import os

# --- CONFIGURACIÓN ---
# ¡IMPORTANTE! Aquí irá tu enlace largo (el que limpiamos antes)
DATABASE_URL = "postgresql://neondb_owner:npg_UdaTN1jlo5XB@ep-spring-pond-ag0wdpd7-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require"

app = FastAPI()

# Permisos para que tu web (HTML) pueda hablar con este script
# Permitir todos los orígenes durante desarrollo; en producción restringir al dominio de tu web
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # o especifica ['https://cartera-pr-pia.onrender.com', 'http://127.0.0.1:5500']
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Añadir un handler OPTIONS genérico (por si el proxy interfiere con preflight)
@app.options("/{path:path}")
def catch_options(path: str):
    return {"ok": True}

# Base de datos
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modelos (Espejo de tus tablas de DBeaver)
class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    premium = Column(Boolean, default=False, nullable=False)
    stripe_subscription_id = Column(String, nullable=True)
    subscription_period_end = Column(Integer, nullable=True)
    cancel_pending = Column(Boolean, default=False, nullable=False)

class DatoUsuario(Base):
    __tablename__ = "datos_usuarios"
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    contenido = Column(JSONB)

# Seguridad (Encriptar contraseñas)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Stripe configuration: set these environment variables in your deployment
STRIPE_API_KEY = os.getenv('STRIPE_API_KEY') or os.getenv('STRIPE_SECRET_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY

# --- FUNCIONES ---

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class RegistroSchema(BaseModel):
    username: str
    password: str

class GuardarDatosSchema(BaseModel):
    username: str
    password: str # Necesitamos la contraseña para verificar que eres tú
    datos: dict   # Aquí va tu JSON


class CancelSchema(BaseModel):
    username: str
    password: str

@app.get("/")
def read_root():
    return {"mensaje": "¡Tu servidor está vivo!"}

@app.post("/registro")
def registrarse(user: RegistroSchema, db: Session = Depends(get_db)):
    # 1. Comprobar si ya existe
    existe = db.query(Usuario).filter(Usuario.username == user.username).first()
    if existe:
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    
    # 2. Crear usuario
    hash_password = pwd_context.hash(user.password)
    nuevo = Usuario(username=user.username, password_hash=hash_password, premium=False)
    db.add(nuevo)
    db.commit()
    return {"mensaje": "Usuario creado"}

@app.post("/login")
def login(user: RegistroSchema, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.username == user.username).first()
    if not usuario or not pwd_context.verify(user.password, usuario.password_hash):
        raise HTTPException(status_code=400, detail="Credenciales incorrectas")
    
    # Buscar sus datos
    datos = db.query(DatoUsuario).filter(DatoUsuario.usuario_id == usuario.id).first()
    return {
        "mensaje": "Login OK",
        "datos": datos.contenido if datos else None,
        "premium": bool(usuario.premium),
        "cancel_pending": bool(usuario.cancel_pending),
        "subscription_period_end": int(usuario.subscription_period_end) if usuario.subscription_period_end else None
    }

@app.post("/guardar")
def guardar(entrada: GuardarDatosSchema, db: Session = Depends(get_db)):
    # 1. Verificar usuario
    usuario = db.query(Usuario).filter(Usuario.username == entrada.username).first()
    if not usuario or not pwd_context.verify(entrada.password, usuario.password_hash):
        raise HTTPException(status_code=401, detail="No autorizado")

    # 2. Guardar o Actualizar datos
    dato_existente = db.query(DatoUsuario).filter(DatoUsuario.usuario_id == usuario.id).first()
    
    if dato_existente:
        dato_existente.contenido = entrada.datos # Actualizamos
    else:
        nuevo_dato = DatoUsuario(usuario_id=usuario.id, contenido=entrada.datos)
        db.add(nuevo_dato)
    
    db.commit()
    return {"mensaje": "Guardado exitoso"}


@app.get('/debug/user/{username}')
def debug_user(username: str, db: Session = Depends(get_db)):
    # Endpoint de depuración: devuelve si el usuario existe y su flag premium
    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if not usuario:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    return { 'username': usuario.username, 'premium': bool(usuario.premium), 'cancel_pending': bool(usuario.cancel_pending), 'subscription_period_end': int(usuario.subscription_period_end) if usuario.subscription_period_end else None }


@app.post('/stripe/webhook')
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Webhook para procesar eventos de Stripe y marcar `premium=True`.

    Recomendado: en el Panel de Stripe (Developers → Webhooks) crea un endpoint
    apuntando a `https://<tu-dominio>/stripe/webhook` y configura la secret
    correspondiente en la variable de entorno `STRIPE_WEBHOOK_SECRET`.
    El webhook busca `client_reference_id` o `metadata.username` en la sesión
    de checkout para identificar al usuario en la base de datos.
    """
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    event = None
    # Intentar verificar firma si tenemos la secret
    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except Exception as e:
            # Firma inválida o payload corrupto
            raise HTTPException(status_code=400, detail=f'Webhook signature verification failed: {str(e)}')
    else:
        # Si no hay webhook secret, parseamos sin verificar (solo para desarrollo)
        try:
            event = json.loads(payload.decode('utf-8'))
        except Exception as e:
            raise HTTPException(status_code=400, detail='Invalid payload')

    # Procesar eventos que nos interesan
    etype = event.get('type') if isinstance(event, dict) else getattr(event, 'type', None)
    # Manejar checkout.session.completed (Payment Link / Checkout)
    if etype == 'checkout.session.completed' or (isinstance(event, dict) and event.get('type') == 'checkout.session.completed'):
        # obtener el objeto session
        sess = event['data']['object'] if isinstance(event, dict) else event['data']['object']
        # buscar username en distintos lugares
        username = None
        try:
            username = sess.get('client_reference_id') or (sess.get('metadata') and sess.get('metadata').get('username'))
        except Exception:
            username = None

        # como fallback, si el usuario usó su email como identifier, intentar emparejar
        if not username:
            try:
                email = sess.get('customer_details', {}).get('email') or sess.get('customer_email')
                if email:
                    # intentar buscar usuario cuyo username sea el email
                    posible = db.query(Usuario).filter(Usuario.username == email).first()
                    if posible:
                        username = posible.username
            except Exception:
                pass

        if username:
            usuario = db.query(Usuario).filter(Usuario.username == username).first()
            if usuario:
                usuario.premium = True

                # guardar id de suscripción de Stripe si viene en la sesión
                try:
                    sub_id = sess.get('subscription')
                except Exception:
                    sub_id = None
                if sub_id:
                    usuario.stripe_subscription_id = sub_id
                    # intentar obtener current_period_end desde la API de Stripe
                    try:
                        sub = stripe.Subscription.retrieve(sub_id)
                        # Preferir top-level current_period_end, pero Stripe puede moverlo a items.data[0]
                        period_end = None
                        if sub:
                            if sub.get('current_period_end'):
                                period_end = sub.get('current_period_end')
                            else:
                                try:
                                    items = sub.get('items', {}).get('data', [])
                                    if items and isinstance(items, list) and len(items) > 0:
                                        period_end = items[0].get('current_period_end')
                                except Exception:
                                    period_end = None
                        if period_end:
                            usuario.subscription_period_end = int(period_end)
                    except Exception:
                        pass

                # si llegamos por checkout que crea suscripción, limpiar cancel_pending
                usuario.cancel_pending = False

                db.add(usuario)
                db.commit()
                return { 'ok': True, 'message': f'Usuario {username} marcado como premium' }
            else:
                # usuario no encontrado; respondemos 200 para que Stripe no reintente
                return { 'ok': False, 'message': 'Usuario no encontrado' }

    # Manejar actualización de suscripción (cancel_at_period_end)
    if etype == 'customer.subscription.updated' or (isinstance(event, dict) and event.get('type') == 'customer.subscription.updated'):
        subs = event['data']['object']
        sub_id = subs.get('id')
        cancel_at_period_end = bool(subs.get('cancel_at_period_end'))
        if sub_id:
            usuario = db.query(Usuario).filter(Usuario.stripe_subscription_id == sub_id).first()
            if usuario:
                # marcar cancel_pending si corresponde (no revocar premium aquí)
                usuario.cancel_pending = cancel_at_period_end
                # actualizar fecha de fin de periodo si viene (puede estar en items.data[0])
                try:
                    period_end = subs.get('current_period_end')
                    if not period_end:
                        items = subs.get('items', {}).get('data', [])
                        if items and isinstance(items, list) and len(items) > 0:
                            period_end = items[0].get('current_period_end')
                    if period_end:
                        usuario.subscription_period_end = int(period_end)
                except Exception:
                    pass
                db.add(usuario)
                db.commit()
                return { 'ok': True, 'message': 'Usuario actualizado por evento de suscripción' }

    # Manejar eliminación efectiva de la suscripción: revocar acceso aquí
    if etype == 'customer.subscription.deleted' or (isinstance(event, dict) and event.get('type') == 'customer.subscription.deleted'):
        subs = event['data']['object']
        sub_id = subs.get('id')
        if sub_id:
            usuario = db.query(Usuario).filter(Usuario.stripe_subscription_id == sub_id).first()
            if usuario:
                usuario.premium = False
                usuario.cancel_pending = False
                usuario.subscription_period_end = None
                # opcional: limpiar el id de suscripción
                usuario.stripe_subscription_id = None
                db.add(usuario)
                db.commit()
                return {'ok': True, 'message': 'Usuario marcado como no premium (subscription deleted)'}

    # Para otros eventos no hacemos nada pero devolvemos 200 OK
    return { 'received': True }


@app.post('/cancelar_suscripcion')
def cancelar_suscripcion(data: CancelSchema, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.username == data.username).first()
    if not usuario or not pwd_context.verify(data.password, usuario.password_hash):
        raise HTTPException(status_code=401, detail="No autorizado")

    if not usuario.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No hay suscripción activa")

    try:
        stripe.Subscription.modify(
            usuario.stripe_subscription_id,
            cancel_at_period_end=True
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")

    # marcar en la base de datos que hay una cancelación pendiente
    try:
        # intentar recuperar la suscripción actualizada para conocer el periodo de fin
        try:
            sub = stripe.Subscription.retrieve(usuario.stripe_subscription_id)
            period_end = None
            if sub:
                if sub.get('current_period_end'):
                    period_end = sub.get('current_period_end')
                else:
                    try:
                        items = sub.get('items', {}).get('data', [])
                        if items and isinstance(items, list) and len(items) > 0:
                            period_end = items[0].get('current_period_end')
                    except Exception:
                        period_end = None
            if period_end:
                usuario.subscription_period_end = int(period_end)
        except Exception:
            pass
        usuario.cancel_pending = True
        db.add(usuario)
        db.commit()
    except Exception:
        # no bloquear la cancelación si el commit falla, pero informar
        pass

    return {"ok": True, "mensaje": "Cancelación programada (fin de periodo)"}
