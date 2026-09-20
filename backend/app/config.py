import os


def env(name: str, default: str) -> str:
    return os.environ.get(name, default)


JWT_SECRET = env("UHRES_JWT_SECRET", "uhres-futo-prototype-do-not-use-in-production")
CORS_ORIGINS = [o.strip() for o in env("UHRES_CORS_ORIGINS", "*").split(",") if o.strip()]
NODE_NAME = env("UHRES_NODE_NAME", "FUTO Health Exchange")
