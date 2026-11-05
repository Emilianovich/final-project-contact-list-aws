# Estado de implementación local

Implementado: Terraform aplicación y bootstrap IAM/OIDC, tres GitHub Actions,
detección por rutas, build por SHA, manifiesto por digest, migración ECS antes
del despliegue, servicios con circuit breaker, prueba /api/health y destroy.

Comprobado localmente: compilación frontend/backend/contratos, 16 pruebas web,
5 pruebas de configuración API y 16 de integración API/PostgreSQL (37 en total),
terraform validate para aplicación/bootstrap, terraform fmt y sintaxis YAML/Python/Bash.
Ambas imágenes linux/amd64 construidas y arrancadas con límites de 0.25 CPU y
512 MiB. Frontend HTTP 200, proxy /api/health HTTP 200, /api/contacts sin token
HTTP 401. El backend tarda unos segundos en arrancar bajo emulación amd64;
la comprobación inicial devolvió 502 antes del arranque y luego quedó saludable.

Pendiente antes de AWS: verificación de identidad AWS y región/seguridad del bucket, tarifas vigentes,
bootstrap remoto, environment GitHub y variables ARN. Después solicitar al usuario
commit/push para probar los workflows. No se ha creado infraestructura AWS.

Entrega académica: conservar monorepo de desarrollo; al preparar carpeta compartida
colocar apps/packages/database/Dockerfiles y configuración raíz bajo aplicacion/,
terraform bajo terraform/, scripts y copias de workflows bajo pipelines/, con README
de reproducción. GitHub exige workflows ejecutables en .github/workflows/.
