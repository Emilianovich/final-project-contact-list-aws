# Tres pipelines en GitHub Actions

Las definiciones ejecutables están en `.github/workflows/`. Esta carpeta contiene
los scripts compartidos: pruebas, publicación de imágenes y despliegue.

1. **Infrastructure**: validación sin credenciales en PR; plan/apply/destroy manual
   en `main`. El apply crea servicios detenidos para permitir el primer build.
2. **Build and publish**: pruebas con PostgreSQL desechable, detección de cambios,
   imágenes amd64 e inmutables por SHA, manifiesto de release con digests ECR.
   Ejecución manual reconstruye ambos componentes para el primer despliegue.
3. **Deploy ECS**: consume exclusivamente el artifact del build exitoso de main,
   registra revisiones, migra antes de actualizar API, inicia servicios y espera
   estabilidad. Verifica que ECS no haya revertido la revisión y prueba `/api/health`.

Los despliegues e infraestructura comparten un grupo de concurrencia. El código
compartido, lockfile y configuración global reconstruyen ambas imágenes; cambios
en database reconstruyen API. Terraform conserva la configuración inicial de las
tareas; el Service ignora revisión/desired_count para no revertir despliegues CI.
El deploy usa las definiciones generadas por Terraform como plantilla y sustituye
la imagen por digest. Después de cambios de infraestructura que afecten variables
o recursos de tareas, ejecutar build manual para desplegar ambos componentes.

No existen credenciales AWS permanentes en GitHub. Crear environment `aws-dev`,
restringir despliegues a `main` y registrar las tres variables ARN del bootstrap.
Configurar revisores del environment si el plan de GitHub lo permite.

Si falla la migración no se actualizan los servicios. ECS circuit breaker revierte
fallos de arranque; el script detecta esa reversión y marca fallo. Un fallo de smoke
test requiere revisar logs y restaurar la revisión anterior desde ECS; no revierte
SQL automáticamente. Solo realizar migraciones compatibles con la versión anterior.
