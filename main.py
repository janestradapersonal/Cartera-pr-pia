from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.dialects.postgresql import JSONB
from passlib.context import CryptContext
from fastapi.middleware.cors import CORSMiddleware
import os

# --- CONFIGURACIÓN ---
# ¡IMPORTANTE! Aquí irá tu enlace largo (el que limpiamos antes)
DATABASE_URL = "postgresql://neondb_owner:npg_UdaTN1jlo5XB@ep-spring-pond-ag0wdpd7-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require"

app = FastAPI()

# Permisos para que tu web (HTML) pueda hablar con este script
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permite que cualquiera se conecte (luego lo cerraremos si quieres)
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class DatoUsuario(Base):
    __tablename__ = "datos_usuarios"
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    contenido = Column(JSONB)

# Seguridad (Encriptar contraseñas)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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
    nuevo = Usuario(username=user.username, password_hash=hash_password)
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
    if datos:
        return {"mensaje": "Login OK", "datos": datos.contenido}
    return {"mensaje": "Login OK", "datos": None}

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
