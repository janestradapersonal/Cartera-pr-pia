from fastapi import FastAPI, HTTPException, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Boolean, DateTime, func, Text
from sqlalchemy.exc import OperationalError, IntegrityError
from fastapi.responses import JSONResponse
import secrets
import logging
from email_service import send_email
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.dialects.postgresql import JSONB
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone

# Roles (single source of truth)
class Role:
    MIEMBRO = 'MIEMBRO'
    COLABORADOR = 'COLABORADOR'
    ADMINISTRADOR = 'ADMINISTRADOR'

# Backwards-compatibility mapping from old DB values to new role names
OLD_ROLE_MAP = {
    'PREGUNTADOR_1': Role.MIEMBRO,
    'PREGUNTADOR_2': Role.COLABORADOR,
    'JEFE': Role.ADMINISTRADOR,
}

DISPLAY_ROLE = {
    Role.MIEMBRO: 'Miembro',
    Role.COLABORADOR: 'Colaborador',
    Role.ADMINISTRADOR: 'Administrador',
}

def normalize_role(r):
    if not r:
        return Role.MIEMBRO
    if r in (Role.MIEMBRO, Role.COLABORADOR, Role.ADMINISTRADOR):
        return r
    return OLD_ROLE_MAP.get(r, r)


def now_utc():
    """Return timezone-aware UTC datetime for consistent comparisons."""
    return datetime.now(timezone.utc)

# Básico in-memory rate limiter para intentos de verificación por email
verification_attempts = {}  # email -> { count: int, first_at: datetime }
# Rate limiter para reenvíos de código
resend_attempts = {}  # email -> { count: int, first_at: datetime }
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
# Configurar CORS. Preferir la variable de entorno FRONTEND_URL (o FRONTEND_ORIGIN)
frontend_env = os.getenv('FRONTEND_URL') or os.getenv('FRONTEND_ORIGIN')
# Orígenes permitidos: orígenes locales + GitHub Pages (sin path)
origins = [
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://janestradapersonal.github.io",
]
if frontend_env and frontend_env not in origins:
    origins.append(frontend_env)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print('CORS enabled', origins)


# Añadir un handler OPTIONS genérico (por si el proxy interfiere con preflight)
@app.options("/{path:path}")
def catch_options(path: str):
    return {"ok": True}


# Asegurar que el preflight a /login responde 200
@app.options('/login')
def options_login():
    try:
        return Response(status_code=200)
    except Exception:
        return Response(status_code=200)

# Base de datos
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modelos (Espejo de tus tablas de DBeaver)
class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    email = Column(String, unique=True, index=True, nullable=True)
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_code_hash = Column(String, nullable=True)
    email_verification_expires_at = Column(DateTime(timezone=True), nullable=True)
    premium = Column(Boolean, default=False, nullable=False)
    stripe_subscription_id = Column(String, nullable=True)
    subscription_period_end = Column(Integer, nullable=True)
    cancel_pending = Column(Boolean, default=False, nullable=False)
    # Rol del usuario (normalizado a los nuevos nombres)
    role = Column(String, default=Role.MIEMBRO, nullable=False)

class DatoUsuario(Base):
    __tablename__ = "datos_usuarios"
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    contenido = Column(JSONB)


# Modelos para el foro
class ForumQuestion(Base):
    __tablename__ = 'forum_questions'
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text)
    author_username = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class ForumAnswer(Base):
    __tablename__ = 'forum_answers'
    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey('forum_questions.id', ondelete='CASCADE'))
    body = Column(Text, nullable=False)
    author_username = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class PendingUser(Base):
    __tablename__ = 'pending_users'
    email = Column(String, primary_key=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    verification_code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

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


@app.exception_handler(OperationalError)
async def sqlalchemy_operational_error_handler(request: Request, exc: OperationalError):
    # Devuelve 503 para indicar que la BD está reconectando
    try:
        return JSONResponse(status_code=503, content={"detail": "DB reconnecting"})
    except Exception:
        return JSONResponse(status_code=503, content={"detail": "DB reconnecting"})

class RegistroSchema(BaseModel):
    email: str
    username: str
    password: str


class RegistroStartSchema(BaseModel):
    email: str
    username: str
    password: str


class RegistroConfirmSchema(BaseModel):
    email: str
    code: str


class ResendSchema(BaseModel):
    email: str

class GuardarDatosSchema(BaseModel):
    username: str
    password: str # Necesitamos la contraseña para verificar que eres tú
    datos: dict   # Aquí va tu JSON


class VerifyEmailSchema(BaseModel):
    email: str
    code: str


@app.post('/verify-email')
def verify_email(payload: VerifyEmailSchema, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if not usuario:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    if usuario.email_verified:
        return {'ok': True, 'message': 'Email ya verificado'}
    # Rate limit básico: máximo 5 intentos en ventana de 15 minutos por email
    win_minutes = 15
    max_attempts = 5
    now = now_utc()
    rec = verification_attempts.get(payload.email)
    if rec:
        first_at = rec.get('first_at')
        if first_at and (now - first_at).total_seconds() > win_minutes * 60:
            # ventana expiró, reset
            verification_attempts[payload.email] = {'count': 0, 'first_at': now}
            rec = verification_attempts[payload.email]
    else:
        verification_attempts[payload.email] = {'count': 0, 'first_at': now}
        rec = verification_attempts[payload.email]

    if rec.get('count', 0) >= max_attempts:
        raise HTTPException(status_code=429, detail='Demasiados intentos, inténtalo más tarde')
    # comprobar expiración
    if not usuario.email_verification_expires_at or usuario.email_verification_expires_at < now:
        raise HTTPException(status_code=400, detail='Código caducado')
    # verificar código (hash)
    if not usuario.email_verification_code_hash or not pwd_context.verify(payload.code, usuario.email_verification_code_hash):
        # incrementar contador de intentos
        verification_attempts[payload.email]['count'] = verification_attempts[payload.email].get('count', 0) + 1
        raise HTTPException(status_code=400, detail='Código inválido')
    # OK -> marcar verificado y limpiar campos
    usuario.email_verified = True
    usuario.email_verification_code_hash = None
    usuario.email_verification_expires_at = None
    db.add(usuario)
    db.commit()
    # limpiar contador de intentos tras verificación exitosa
    try:
        if payload.email in verification_attempts:
            del verification_attempts[payload.email]
    except Exception:
        pass
    return {'ok': True, 'message': 'Email verificado'}


@app.post('/registro/start')
def registro_start(payload: RegistroStartSchema, db: Session = Depends(get_db), request: Request = None):
    # Validar unicidad contra usuarios y pending
    if db.query(Usuario).filter(Usuario.username == payload.username).first():
        raise HTTPException(status_code=400, detail='Username ya existe')
    if db.query(Usuario).filter(Usuario.email == payload.email).first():
        raise HTTPException(status_code=400, detail='Email ya registrado')
    if db.query(PendingUser).filter((PendingUser.username == payload.username) | (PendingUser.email == payload.email)).first():
        raise HTTPException(status_code=400, detail='Ya existe un registro pendiente para ese email o usuario')

    codigo = str(secrets.randbelow(900000) + 100000)
    codigo_hash = pwd_context.hash(codigo)
    # El código expira en 1 minuto para verificación rápida durante pruebas (UTC-aware)
    expires = now_utc() + timedelta(minutes=1)
    pw_hash = pwd_context.hash(payload.password)

    pu = PendingUser(email=payload.email, username=payload.username, password_hash=pw_hash,
                     verification_code_hash=codigo_hash, expires_at=expires)
    db.add(pu)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail='Username o email ya existe (pending)')

    email_sent = True
    try:
        subject = 'Código de verificación de registro'
        body = f'Tu código de verificación es: {codigo}\nCaduca en 15 minutos.'
        send_email(payload.email, subject, body)
    except Exception:
        logging.exception('Error enviando email de registro')
        email_sent = False

    return {'ok': True, 'mensaje': 'Código enviado', 'email_sent': email_sent}


@app.post('/registro/confirm')
def registro_confirm(payload: RegistroConfirmSchema, db: Session = Depends(get_db)):
    pu = db.query(PendingUser).filter(PendingUser.email == payload.email).first()
    if not pu:
        raise HTTPException(status_code=404, detail='Registro pendiente no encontrado')
    now = now_utc()
    # Log temporal para depuración de timezone
    try:
        logging.debug('registro_confirm: pu.expires_at=%s pu.expires_at.tzinfo=%s now.tzinfo=%s', pu.expires_at, getattr(pu.expires_at, 'tzinfo', None), now.tzinfo)
    except Exception:
        pass
    if pu.expires_at < now:
        # eliminar pending
        try:
            db.delete(pu)
            db.commit()
        except Exception:
            db.rollback()
        raise HTTPException(status_code=400, detail='Código expirado')
    if not pwd_context.verify(payload.code, pu.verification_code_hash):
        raise HTTPException(status_code=400, detail='Código inválido')

    # Crear usuario definitivo con email_verified=True
    nuevo = Usuario(username=pu.username, password_hash=pu.password_hash, premium=False,
                    email=pu.email, email_verified=True)
    db.add(nuevo)
    try:
        db.delete(pu)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail='No se pudo crear el usuario (posible duplicado)')
    return {'ok': True, 'mensaje': 'Usuario creado y email verificado'}


@app.post('/registro/resend')
def registro_resend(payload: ResendSchema, db: Session = Depends(get_db)):
    # Rate limit básico para reenvíos: máximo 5 reenvíos en 15 minutos por email
    win_minutes = 15
    max_attempts = 5
    now = now_utc()
    rec = resend_attempts.get(payload.email)
    if rec:
        first_at = rec.get('first_at')
        if first_at and (now - first_at).total_seconds() > win_minutes * 60:
            resend_attempts[payload.email] = {'count': 0, 'first_at': now}
            rec = resend_attempts[payload.email]
    else:
        resend_attempts[payload.email] = {'count': 0, 'first_at': now}
        rec = resend_attempts[payload.email]

    if rec.get('count', 0) >= max_attempts:
        raise HTTPException(status_code=429, detail='Demasiados reenvíos, inténtalo más tarde')

    pu = db.query(PendingUser).filter(PendingUser.email == payload.email).first()
    if not pu:
        # No hay pending; informar al cliente para que inicie registro
        raise HTTPException(status_code=404, detail='Registro pendiente no encontrado')

    # Generar nuevo código de 6 dígitos y actualizar
    codigo = str(secrets.randbelow(900000) + 100000)
    codigo_hash = pwd_context.hash(codigo)
    pu.verification_code_hash = codigo_hash
    pu.expires_at = now + timedelta(minutes=1)
    db.add(pu)
    try:
        db.commit()
    except Exception:
        db.rollback()

    email_sent = True
    try:
        subject = 'Nuevo código de verificación'
        body = f'Tu nuevo código de verificación es: {codigo}\nCaduca en 1 minuto.'
        send_email(pu.email, subject, body)
    except Exception:
        logging.exception('Error enviando email de reenvío')
        email_sent = False

    # incrementar contador de reenvíos
    try:
        resend_attempts[payload.email]['count'] = resend_attempts[payload.email].get('count', 0) + 1
    except Exception:
        pass

    return {'ok': True, 'email_sent': email_sent}


class CancelSchema(BaseModel):
    username: str
    password: str

@app.get("/")
def read_root():
    return {"mensaje": "¡Tu servidor está vivo!"}

@app.post("/registro")
def registrarse(user: RegistroSchema, db: Session = Depends(get_db), request: Request = None):
    # Compatibilidad: indicar al cliente que use /registro/start
    raise HTTPException(status_code=400, detail='Use /registro/start para iniciar el proceso de registro por email')

@app.post("/login")
def login(user: RegistroSchema, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.username == user.username).first()
    if not usuario or not pwd_context.verify(user.password, usuario.password_hash):
        raise HTTPException(status_code=400, detail="Credenciales incorrectas")
    # El cliente debe enviar email; comprobar que coincida con el del usuario
    if not getattr(user, 'email', None):
        raise HTTPException(status_code=400, detail='Email requerido')
    if not usuario.email or usuario.email.lower() != user.email.lower():
        raise HTTPException(status_code=401, detail='Email no coincide')
    # Verificar que el email esté validado
    if usuario.email and not usuario.email_verified:
        raise HTTPException(status_code=403, detail="Email no verificado")
    
    # Buscar sus datos
    datos = db.query(DatoUsuario).filter(DatoUsuario.usuario_id == usuario.id).first()
    return {
        "mensaje": "Login OK",
        "datos": datos.contenido if datos else None,
        "premium": bool(usuario.premium),
        "role": normalize_role(usuario.role if hasattr(usuario, 'role') else None),
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


# --- Newsletter: modelo y endpoints ---
class NewsletterPost(Base):
    __tablename__ = 'newsletter_posts'
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    file_url = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_username = Column(String, ForeignKey('usuarios.username'), nullable=False)


@app.get('/me')
def get_me(request: Request, db: Session = Depends(get_db)):
    username = request.headers.get('x-username') or request.query_params.get('username')
    password = request.headers.get('x-password') or request.query_params.get('password')
    if not username or not password:
        raise HTTPException(status_code=401, detail='No autorizado')
    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if not usuario or not pwd_context.verify(password, usuario.password_hash):
        raise HTTPException(status_code=401, detail='Credenciales inválidas')
    try:
        print('ME premium=', bool(usuario.premium))
    except Exception:
        print('ME premium: error reading attribute')
    return { 'username': usuario.username, 'premium': bool(usuario.premium), 'role': normalize_role(usuario.role if hasattr(usuario, 'role') else None) }


@app.get('/api/wallet/{username}')
def get_wallet(username: str, request: Request, db: Session = Depends(get_db)):
    """Devuelve el JSON de la cartera del usuario.

    Requiere autenticación simple: pasar la contraseña en el header `x-password`
    o en el query param `password` (coincidir con la contraseña en BD).
    """
    password = request.headers.get('x-password') or request.query_params.get('password')
    if not username or not password:
        raise HTTPException(status_code=401, detail='Credenciales requeridas')
    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if not usuario or not pwd_context.verify(password, usuario.password_hash):
        raise HTTPException(status_code=401, detail='Credenciales inválidas')
    datos = db.query(DatoUsuario).filter(DatoUsuario.usuario_id == usuario.id).first()
    if not datos:
        return {'ok': True, 'datos': None}
    return {'ok': True, 'datos': datos.contenido}


class NewsletterCreate(BaseModel):
    title: str
    description: str = None
    file_url: str
    username: str
    password: str


@app.get('/newsletter')
def list_newsletter(request: Request, db: Session = Depends(get_db)):
    username = request.headers.get('x-username') or request.query_params.get('username')
    password = request.headers.get('x-password') or request.query_params.get('password')
    if not username or not password:
        raise HTTPException(status_code=401, detail='No autorizado')
    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if not usuario or not pwd_context.verify(password, usuario.password_hash):
        raise HTTPException(status_code=401, detail='Credenciales inválidas')
    if not usuario.premium:
        raise HTTPException(status_code=403, detail='Acceso restringido a suscriptores')
    posts = db.query(NewsletterPost).order_by(NewsletterPost.created_at.desc()).all()
    out = []
    for p in posts:
        out.append({ 'id': p.id, 'title': p.title, 'description': p.description, 'file_url': p.file_url, 'created_at': p.created_at.isoformat() if p.created_at else None, 'created_by': p.created_by_username })
    return out


@app.post('/newsletter')
def create_newsletter(payload: NewsletterCreate, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.username == payload.username).first()
    if not usuario or not pwd_context.verify(payload.password, usuario.password_hash):
        raise HTTPException(status_code=401, detail='Credenciales inválidas')
    if (not hasattr(usuario, 'role')) or normalize_role(usuario.role) != Role.ADMINISTRADOR:
        raise HTTPException(status_code=403, detail='Necesitas rol ADMINISTRADOR para publicar')
    post = NewsletterPost(title=payload.title, description=payload.description, file_url=payload.file_url, created_by_username=usuario.username)
    db.add(post)
    db.commit()
    return {'ok': True, 'id': post.id}


@app.delete('/newsletter/{post_id}')
def delete_newsletter(post_id: int, request: Request, db: Session = Depends(get_db)):
    username = request.headers.get('x-username')
    password = request.headers.get('x-password')
    if not username or not password:
        body = {}
        try:
            body = request.json()
        except Exception:
            body = {}
        username = username or body.get('username')
        password = password or body.get('password')
    if not username or not password:
        raise HTTPException(status_code=401, detail='No autorizado')
    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if not usuario or not pwd_context.verify(password, usuario.password_hash):
        raise HTTPException(status_code=401, detail='Credenciales inválidas')
    if (not hasattr(usuario, 'role')) or normalize_role(usuario.role) != Role.ADMINISTRADOR:
        raise HTTPException(status_code=403, detail='Necesitas rol ADMINISTRADOR para eliminar')
    post = db.query(NewsletterPost).filter(NewsletterPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post no encontrado')
    db.delete(post)
    db.commit()
    return {'ok': True}


# Crear tablas si no existen (útil en desarrollo)
try:
    Base.metadata.create_all(bind=engine)
except Exception:
    pass


# Modelo para solicitudes de rol
class RoleRequest(Base):
    __tablename__ = 'role_requests'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, ForeignKey('usuarios.username'), nullable=False)
    requested_role = Column(String, nullable=False)
    status = Column(String, nullable=False, default='pending')
    token = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True), nullable=True)


class RoleRequestCreate(BaseModel):
    requested_role: str
    username: str = None
    password: str = None


@app.post('/role-requests', include_in_schema=True)
def create_role_request(payload: RoleRequestCreate, db: Session = Depends(get_db), request: Request = None):
    # permitir envió vía body o headers x-username/x-password
    username = payload.username or (request.headers.get('x-username') if request else None)
    password = payload.password or (request.headers.get('x-password') if request else None)
    if not username or not password:
        raise HTTPException(status_code=401, detail='No autorizado')
    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if not usuario or not pwd_context.verify(password, usuario.password_hash):
        raise HTTPException(status_code=401, detail='Credenciales inválidas')
    # validar rol solicitado (aceptar tanto nombres antiguos como los nuevos)
    allowed = {
        'PREGUNTADOR_1', 'PREGUNTADOR_2', 'JEFE',
        Role.MIEMBRO, Role.COLABORADOR, Role.ADMINISTRADOR
    }
    if payload.requested_role not in allowed:
        raise HTTPException(status_code=400, detail='requested_role inválido')
    # Normalizar al nombre canonical (nuevo)
    requested_normal = normalize_role(payload.requested_role)
    token = secrets.token_urlsafe(32)
    rr = RoleRequest(username=username, requested_role=requested_normal, status='pending', token=token)
    db.add(rr)
    db.commit()
    db.refresh(rr)

    # enviar email al admin con enlaces de aprobación/rechazo
    try:
        approve_url = f"{request.url.scheme}://{request.url.hostname}/role-requests/{rr.id}/approve?token={token}" if request else f"/role-requests/{rr.id}/approve?token={token}"
        reject_url = f"{request.url.scheme}://{request.url.hostname}/role-requests/{rr.id}/reject?token={token}" if request else f"/role-requests/{rr.id}/reject?token={token}"
    except Exception:
        approve_url = f"/role-requests/{rr.id}/approve?token={token}"
        reject_url = f"/role-requests/{rr.id}/reject?token={token}"

    # usar etiqueta legible en el email y enviar datos del solicitante al admin
    display_requested = DISPLAY_ROLE.get(requested_normal, requested_normal)
    # construir body de respaldo (en caso de no usar plantilla dinámica)
    body = f"El usuario {username} ({usuario.email or 'sin email'}) solicita el rol {display_requested}.\n\nAprobar: {approve_url}\nRechazar: {reject_url}\n"
    email_sent = True
    try:
        admin_email = os.getenv('ROLE_REQUEST_ADMIN') or 'janestrada888@gmail.com'
        # preferir APP_BASE_URL si está configurada para construir enlaces
        app_base = os.getenv('APP_BASE_URL')
        if app_base:
            approve_url = f"{app_base}/role-requests/{rr.id}/approve?token={token}"
            reject_url = f"{app_base}/role-requests/{rr.id}/reject?token={token}"
            body = f"El usuario {username} ({usuario.email or 'sin email'}) solicita el rol {display_requested}.\n\nAprobar: {approve_url}\nRechazar: {reject_url}\n"
        # Log temporal antes de enviar
        try:
            print('role change request', username, usuario.email, requested_normal)
        except Exception:
            print('role change request, could not read email')

        # Intentar usar plantilla dinámica de SendGrid si está configurada
        print("SENDGRID_ROLE_REQUEST_TEMPLATE=", os.getenv("SENDGRID_ROLE_REQUEST_TEMPLATE"))
        template_id = os.getenv('SENDGRID_ROLE_REQUEST_TEMPLATE')
        dynamic_data = {
            'requester_username': username,
            'requester_email': usuario.email or '',
            'requested_role': display_requested,
            'approve_url': approve_url,
            'reject_url': reject_url,
        }
        if template_id:
            send_email(admin_email, subject=f"Solicitud de rol: {username}", template_id=template_id, dynamic_template_data=dynamic_data)
        else:
            send_email(admin_email, f"Solicitud de rol: {username}", body)
    except Exception as e:
        email_sent = False
        logging.exception('Error sending role request email')

    return {'ok': True, 'id': rr.id, 'email_sent': email_sent}


@app.get('/role-requests/{req_id}/approve', include_in_schema=True)
def approve_role_request(req_id: int, token: str, db: Session = Depends(get_db)):
    print('DECISION endpoint HIT', req_id, 'approve')
    rr = db.query(RoleRequest).filter(RoleRequest.id == req_id).first()
    if not rr or rr.token != token or rr.status != 'pending':
        raise HTTPException(status_code=404, detail='Solicitud no encontrada o token inválido')
    # intentar obtener usuario por user_id si está presente, sino por username
    usuario = None
    try:
        if hasattr(rr, 'user_id') and rr.user_id:
            usuario = db.query(Usuario).filter(Usuario.id == rr.user_id).first()
    except Exception:
        usuario = None
    if not usuario and hasattr(rr, 'username') and rr.username:
        usuario = db.query(Usuario).filter(Usuario.username == rr.username).first()
    if not usuario:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    # Log antes de la decisión y del envío
    try:
        print('DECISION email target', 'user_id=', getattr(rr, 'user_id', None), 'email=', usuario.email, 'username=', usuario.username, 'requested_role=', rr.requested_role)
    except Exception:
        print('DECISION email target: could not read some fields')
    print('ENV SENDGRID_ROLE_DECISION_TEMPLATE=', os.getenv('SENDGRID_ROLE_DECISION_TEMPLATE'))

    # asignar rol
    usuario.role = normalize_role(rr.requested_role)
    rr.status = 'approved'
    rr.decided_at = func.now()
    db.add(usuario)
    db.add(rr)
    db.commit()

    # enviar email al solicitante informando la decisión
    try:
        template_id = os.getenv('SENDGRID_ROLE_DECISION_TEMPLATE')
        subject = "Cambio de rol | Senzillament Finances"
        body = f"Hola {usuario.username},\n\nTu solicitud para el rol {DISPLAY_ROLE.get(rr.requested_role, rr.requested_role)} ha sido aprobada.\n\nGracias.\n"
        # construir home_url desde FRONTEND_URL o APP_BASE_URL, con fallback seguro
        home_url = os.getenv("FRONTEND_URL") or os.getenv("APP_BASE_URL") or 'https://janestradapersonal.github.io'
        if not str(home_url).lower().startswith('http'):
            home_url = 'https://' + str(home_url)
        try:
            print('DECISION home_url used=', home_url)
        except Exception:
            print('DECISION home_url used: could not stringify')
        dynamic = {
            'requester_username': usuario.username,
            'requester_email': usuario.email or '',
            'requested_role': DISPLAY_ROLE.get(rr.requested_role, rr.requested_role),
            'approve_url': '',
            'reject_url': '',
            'home_url': home_url,
            'decision': 'ACEPTADO',
            'subject': subject,
        }
        # log para depuración en Render: confirmar qué datos dinámicos se envían
        try:
            print('DECISION dynamic_data', dynamic)
        except Exception:
            print('DECISION dynamic_data: could not stringify')
        if template_id:
            send_email(usuario.email, subject=subject, template_id=template_id, dynamic_template_data=dynamic)
        else:
            send_email(usuario.email, subject, body)
    except Exception:
        logging.exception('Error sending decision email to user')

    return {'ok': True, 'message': f'Usuario {usuario.username} ahora es {usuario.role}'}


@app.get('/role-requests/{req_id}/reject', include_in_schema=True)
def reject_role_request(req_id: int, token: str, db: Session = Depends(get_db)):
    print('DECISION endpoint HIT', req_id, 'reject')
    rr = db.query(RoleRequest).filter(RoleRequest.id == req_id).first()
    if not rr or rr.token != token or rr.status != 'pending':
        raise HTTPException(status_code=404, detail='Solicitud no encontrada o token inválido')
    # intentar obtener usuario por user_id si está presente, sino por username
    usuario = None
    try:
        if hasattr(rr, 'user_id') and rr.user_id:
            usuario = db.query(Usuario).filter(Usuario.id == rr.user_id).first()
    except Exception:
        usuario = None
    if not usuario and hasattr(rr, 'username') and rr.username:
        usuario = db.query(Usuario).filter(Usuario.username == rr.username).first()
    if not usuario:
        # marcar solicitud rechazada igualmente
        rr.status = 'rejected'
        rr.decided_at = func.now()
        db.add(rr)
        db.commit()
        return {'ok': True, 'message': 'Solicitud rechazada (usuario no encontrado)'}
    # Log antes de enviar
    try:
        print('DECISION email target', 'user_id=', getattr(rr, 'user_id', None), 'email=', usuario.email, 'username=', usuario.username, 'requested_role=', rr.requested_role)
    except Exception:
        print('DECISION email target: could not read some fields')
    print('ENV SENDGRID_ROLE_DECISION_TEMPLATE=', os.getenv('SENDGRID_ROLE_DECISION_TEMPLATE'))

    rr.status = 'rejected'
    rr.decided_at = func.now()
    db.add(rr)
    db.commit()

    # enviar email al solicitante informando la decisión
    try:
        template_id = os.getenv('SENDGRID_ROLE_DECISION_TEMPLATE')
        subject = "Cambio de rol | Senzillament Finances"
        body = f"Hola {usuario.username},\n\nTu solicitud para el rol {DISPLAY_ROLE.get(rr.requested_role, rr.requested_role)} ha sido rechazada.\n\nGracias.\n"
        # construir home_url desde FRONTEND_URL o APP_BASE_URL, con fallback seguro
        home_url = os.getenv("FRONTEND_URL") or os.getenv("APP_BASE_URL") or 'https://janestradapersonal.github.io'
        if not str(home_url).lower().startswith('http'):
            home_url = 'https://' + str(home_url)
        try:
            print('DECISION home_url used=', home_url)
        except Exception:
            print('DECISION home_url used: could not stringify')
        dynamic = {
            'requester_username': usuario.username,
            'requester_email': usuario.email or '',
            'requested_role': DISPLAY_ROLE.get(rr.requested_role, rr.requested_role),
            'approve_url': '',
            'reject_url': '',
            'home_url': home_url,
            'decision': 'RECHAZADO',
            'subject': subject,
        }
        # log para depuración en Render: confirmar qué datos dinámicos se envían
        try:
            print('DECISION dynamic_data', dynamic)
        except Exception:
            print('DECISION dynamic_data: could not stringify')
        if template_id:
            send_email(usuario.email, subject=subject, template_id=template_id, dynamic_template_data=dynamic)
        else:
            send_email(usuario.email, subject, body)
    except Exception:
        logging.exception('Error sending decision email to user')

    return {'ok': True, 'message': 'Solicitud rechazada'}


# Helpers de autenticación para el foro
def get_authenticated_user_from_headers(request: Request, db: Session):
    username = request.headers.get('x-username') or request.query_params.get('username')
    password = request.headers.get('x-password') or request.query_params.get('password')
    if not username or not password:
        return None
    usuario = db.query(Usuario).filter(Usuario.username == username).first()
    if not usuario or not pwd_context.verify(password, usuario.password_hash):
        return None
    return usuario


def require_roles(usuario, allowed_roles):
    if not usuario:
        return False
    r = normalize_role(usuario.role if hasattr(usuario, 'role') else None)
    return r in allowed_roles


# --- Endpoints del foro ---
class ForumQuestionCreate(BaseModel):
    title: str
    body: str = None


class ForumAnswerCreate(BaseModel):
    body: str


@app.get('/api/forum/questions')
def list_forum_questions(db: Session = Depends(get_db)):
    # público: listar preguntas no eliminadas con contador de respuestas activas
    qs = db.query(ForumQuestion).filter(ForumQuestion.deleted_at == None).order_by(ForumQuestion.created_at.desc()).all()
    out = []
    for q in qs:
        cnt = db.query(ForumAnswer).filter(ForumAnswer.question_id == q.id, ForumAnswer.deleted_at == None).count()
        out.append({'id': q.id, 'title': q.title, 'body': q.body, 'author': q.author_username, 'created_at': q.created_at.isoformat() if q.created_at else None, 'answers_count': cnt})
    return out


@app.get('/api/forum/questions/{qid}')
def get_forum_question(qid: int, db: Session = Depends(get_db)):
    q = db.query(ForumQuestion).filter(ForumQuestion.id == qid, ForumQuestion.deleted_at == None).first()
    if not q:
        raise HTTPException(status_code=404, detail='Pregunta no encontrada')
    answers = db.query(ForumAnswer).filter(ForumAnswer.question_id == q.id, ForumAnswer.deleted_at == None).order_by(ForumAnswer.created_at.asc()).all()
    ans_out = [{'id': a.id, 'body': a.body, 'author': a.author_username, 'created_at': a.created_at.isoformat() if a.created_at else None} for a in answers]
    return {'question': {'id': q.id, 'title': q.title, 'body': q.body, 'author': q.author_username, 'created_at': q.created_at.isoformat() if q.created_at else None}, 'answers': ans_out}


@app.post('/api/forum/questions')
def create_forum_question(payload: ForumQuestionCreate, request: Request = None, db: Session = Depends(get_db)):
    usuario = get_authenticated_user_from_headers(request, db)
    if not usuario:
        raise HTTPException(status_code=401, detail='No autorizado')
    # roles permitidos: MIEMBRO, COLABORADOR, ADMINISTRADOR
    if not require_roles(usuario, {Role.MIEMBRO, Role.COLABORADOR, Role.ADMINISTRADOR}):
        raise HTTPException(status_code=403, detail='Rol insuficiente')
    q = ForumQuestion(title=payload.title, body=payload.body, author_username=usuario.username)
    db.add(q)
    db.commit()
    db.refresh(q)
    return {'ok': True, 'id': q.id}


@app.post('/api/forum/questions/{qid}/answers')
def create_forum_answer(qid: int, payload: ForumAnswerCreate, request: Request = None, db: Session = Depends(get_db)):
    usuario = get_authenticated_user_from_headers(request, db)
    if not usuario:
        raise HTTPException(status_code=401, detail='No autorizado')
    # solo COLABORADOR y ADMIN pueden responder
    if not require_roles(usuario, {Role.COLABORADOR, Role.ADMINISTRADOR}):
        raise HTTPException(status_code=403, detail='Rol insuficiente')
    q = db.query(ForumQuestion).filter(ForumQuestion.id == qid, ForumQuestion.deleted_at == None).first()
    if not q:
        raise HTTPException(status_code=404, detail='Pregunta no encontrada')
    a = ForumAnswer(question_id=q.id, body=payload.body, author_username=usuario.username)
    db.add(a)
    db.commit()
    db.refresh(a)
    return {'ok': True, 'id': a.id}


@app.delete('/api/forum/questions/{qid}')
def delete_forum_question(qid: int, request: Request = None, db: Session = Depends(get_db)):
    usuario = get_authenticated_user_from_headers(request, db)
    if not usuario:
        raise HTTPException(status_code=401, detail='No autorizado')
    if not require_roles(usuario, {Role.ADMINISTRADOR}):
        raise HTTPException(status_code=403, detail='Rol insuficiente')
    q = db.query(ForumQuestion).filter(ForumQuestion.id == qid).first()
    if not q:
        raise HTTPException(status_code=404, detail='Pregunta no encontrada')
    q.deleted_at = func.now()
    db.add(q)
    db.commit()
    return {'ok': True}


@app.delete('/api/forum/answers/{aid}')
def delete_forum_answer(aid: int, request: Request = None, db: Session = Depends(get_db)):
    usuario = get_authenticated_user_from_headers(request, db)
    if not usuario:
        raise HTTPException(status_code=401, detail='No autorizado')
    if not require_roles(usuario, {Role.ADMINISTRADOR}):
        raise HTTPException(status_code=403, detail='Rol insuficiente')
    a = db.query(ForumAnswer).filter(ForumAnswer.id == aid).first()
    if not a:
        raise HTTPException(status_code=404, detail='Respuesta no encontrada')
    a.deleted_at = func.now()
    db.add(a)
    db.commit()
    return {'ok': True}
