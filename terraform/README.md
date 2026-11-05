# Infraestructura de presentación

Región `us-east-2`, cuenta `817345470591`, infraestructura nueva. La VPC
`final-project-contact-list` contiene dos subredes públicas para ALB, dos privadas
para aplicación/ALB interno y dos privadas para RDS. Las tareas y endpoints usan
solo AZ a para ahorrar; los ALB abarcan a y b. RDS es Single-AZ, 20 GiB gp3,
PostgreSQL 16 en db.t4g.micro. No hay NAT ni endpoint STS.

Cuatro endpoints de interfaz (ECR API/DKR, Logs, Secrets Manager) en AZ a y un
endpoint S3 Gateway permiten arrancar Fargate sin Internet. Los SG de las tareas
permiten HTTPS hacia endpoints y el prefix list de S3. DNS de la VPC está habilitado.

Flujo: Internet:80 → ALB público → Nginx:8080 → ALB interno:80 → API:3000 → RDS:5432.
Cada salto usa SG de origen/destino específicos. El ALB público solo apunta a web.
Nginx elimina `/api/` al reenviar, por lo que `/api/contacts` llega como `/contacts`.
BACKEND_UPSTREAM apunta al DNS interno. curl puede llamar `/api` a través de Nginx:
el aislamiento de red impide acceso directo, pero JWT sigue siendo obligatorio.

## Preparación local y bootstrap (una vez)

Instalar Terraform >=1.10 y <2, AWS CLI, Docker Desktop, Node 24 y pnpm 11.1.2.
Verificar identidad con `aws sts get-caller-identity`. Comprobar región del bucket
existente; ajustar region en backend.hcl.example si el bucket está en otra región
(no cambia la región de los recursos). Habilitar cifrado, versionado y bloqueo
público del bucket. El estado contiene contraseñas y debe ser confidencial.

Inicializar bootstrap con una identidad local autorizada:

```sh
terraform -chdir=terraform/bootstrap init -backend-config=../backend.hcl.example -backend-config=key=final-project-contact-list/bootstrap/terraform.tfstate
terraform -chdir=terraform/bootstrap plan -out=bootstrap.tfplan
terraform -chdir=terraform/bootstrap apply bootstrap.tfplan
terraform -chdir=terraform/bootstrap output github_variables
```

Si el proveedor GitHub OIDC ya existe, pasar `-var=existing_oidc_provider_arn=ARN`
al plan. El bootstrap mantiene roles/OIDC en estado separado y no toca el bucket.
El role infra tiene permisos de administración de los servicios usados en us-east-2;
usar exclusivamente esta cuenta de laboratorio. Los roles build/deploy son limitados.

En GitHub crear environment `aws-dev`, permitir solo rama main y configurar variables
AWS_INFRA_ROLE_ARN, AWS_BUILD_ROLE_ARN, AWS_DEPLOY_ROLE_ARN con los outputs.
No subir archivos .env, tfstate, tfplan ni contraseñas. No hace falta crear secretos
manualmente: Terraform genera contraseña y dos claves JWT distintas en Secrets Manager.

## Primer despliegue

Ejecutar workflow **1 - Infrastructure**, acción plan y después apply en main.
Después ejecutar **2 - Build and publish** manualmente: publica ambas imágenes y
activa **3 - Deploy ECS**. La migración crea esquema y catálogo de países (necesario
para la aplicación); no crea usuarios ni contactos de demostración.

Para ejecución local equivalente:

```sh
terraform -chdir=terraform init -backend-config=backend.hcl.example
terraform -chdir=terraform fmt -check
terraform -chdir=terraform validate
terraform -chdir=terraform plan -var-file=terraform.tfvars.example -out=dev.tfplan
terraform -chdir=terraform apply dev.tfplan
terraform -chdir=terraform output -json deployment
```

Una Task Definition inicial bootstrap puede apuntar a una etiqueta inexistente:
no se ejecuta porque desired_count inicia en cero. El primer deploy sustituye la
imagen por digest real, ejecuta migración e inicia una tarea de cada servicio.
Las tareas usan 0.25 vCPU y 512 MiB. Se permiten dos tareas brevemente durante rollout.

## Verificación y limpieza

Probar registro, login, CRUD, /api/health, reemplazo de tareas e IPs del Target Group.
Verificar que backend/RDS no tengan IP pública y ALB interno no acepte Internet.

Ejecutar workflow Infrastructure con acción destroy tras la prueba. Elimina RDS
sin snapshot, imágenes ECR, secretos y aplicación: solo usar con datos desechables.
Conserva bucket y bootstrap IAM/OIDC para volver a desplegar. Cancelar/esperar builds
antes de destroy. El siguiente apply + build manual recrea todo, con DNS nuevo.

Dos ALB, cuatro interface endpoints, RDS y Fargate facturan mientras existan.
Mantener el laboratorio solo durante pruebas/demo; verificar precios y presupuesto
antes de apply. El crédito disponible no se valida automáticamente por Terraform.
No se incorpora ACM, HTTPS, WAF, NAT, Multi-AZ RDS, autoscaling ni datos de demo.
