# Construcción y entrega para ECS/Fargate

ECS no recibe un Dockerfile ni construye el repositorio. Fargate descarga una
imagen ya construida desde ECR. Los Dockerfiles viven dentro de cada aplicación,
pero su contexto de construcción es la raíz del monorepo porque ambos consumen
`packages/contracts` y el lockfile común.

Por eso estos comandos se ejecutan desde la raíz:

```sh
docker build --platform linux/amd64 -f apps/web/Dockerfile -t cerca-web .
docker build --platform linux/amd64 -f apps/api/Dockerfile -t cerca-api .
```

El punto final es el contexto. Ejecutar `docker build .` dentro de `apps/web` o
`apps/api` no funciona y no es un flujo soportado.

## ECR

Crea dos repositorios ECR, autentica Docker y publica con un tag inmutable, por
ejemplo el SHA del commit:

```sh
AWS_ACCOUNT_ID=123456789012
AWS_REGION=us-east-1
IMAGE_TAG=$(git rev-parse --short=12 HEAD)
ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

REGISTRY="$ECR_REGISTRY" TAG="$IMAGE_TAG" docker buildx bake --push
```

`docker-bake.hcl` fija el contexto correcto y publica ambas imágenes en el
mismo repositorio ECR, diferenciadas como `web-<tag>` y `api-<tag>`. También
genera imágenes `linux/amd64`, compatibles con una tarea Fargate configurada
para X86_64. Si la tarea usa ARM64, cambia `platforms` a `linux/arm64` de forma
deliberada.

## Servicios y migración

- La definición de tarea web usa `contact-list:web-<tag>`, puerto 8080 y la variable
  `BACKEND_UPSTREAM` con una URL accesible desde el contenedor web. Nginx reenvía
  `/api/*` a esa URL; el navegador solo se comunica con el frontend.
- La definición de tarea API usa `contact-list:api-<tag>`, puerto 3000, variables de
  RDS/CORS y secretos obtenidos de Secrets Manager.
- Antes de actualizar el servicio API, ejecuta una tarea puntual usando la
  misma imagen API y sobrescribe el comando con:

```text
node apps/api/dist/database/migrate.js
```

La tarea de migración necesita las mismas variables de base de datos que la
API. Debe terminar con código 0 antes de desplegar la nueva revisión.

## Ausencia de load balancer

Una tarea Fargate con IP pública puede recibir tráfico directamente si su
security group permite el puerto, pero la IP cambia cuando ECS reemplaza la
tarea. Además, el JavaScript del frontend se ejecuta en el navegador: no puede
usar un nombre privado de Service Connect o Cloud Map como `api:3000`.

Para una prueba sin load balancer, el frontend puede actuar como proxy. Configura
`BACKEND_UPSTREAM` con la IP privada actual del backend, por ejemplo
`http://10.0.2.42:3000`, y permite TCP 3000 en el SG del backend únicamente desde
el SG del frontend. Para una URL interna estable al reemplazar tareas, crea un ECS
Service con Service Connect o Cloud Map y usa su nombre de descubrimiento como
`BACKEND_UPSTREAM`.

Para un entorno duradero necesitarás un ALB, API Gateway u otro punto de entrada
estable y TLS.

Para evitar depender de la IP efímera de la tarea web durante una prueba puntual,
la API permite `CORS_ALLOW_ANY_ORIGIN=true`. Úsalo únicamente mientras se accede
con IPs públicas temporales; conserva `FRONTEND_ORIGIN` como una URL válida y
vuelve a `false` al usar un endpoint estable.
