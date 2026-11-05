terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.7" }
  }
  backend "s3" {}
}

provider "aws" {
  region              = "us-east-2"
  allowed_account_ids = ["817345470591"]
  default_tags { tags = { Project = "final-project-contact-list", Environment = "dev", ManagedBy = "Terraform" } }
}

variable "web_image" { type = string }
variable "api_image" { type = string }
variable "service_count" {
  type    = number
  default = 0
  validation {
    condition     = contains([0, 1], var.service_count)
    error_message = "Use 0 during bootstrap and 1 after migration."
  }
}

locals {
  name  = "final-project-contact-list"
  zones = ["us-east-2a", "us-east-2b"]
  subnet_specs = {
    public_a = { name = "public-alb-us-east-2a", cidr = "10.0.1.0/24", az = 0, public = true }
    public_b = { name = "public-alb-us-east-2b", cidr = "10.0.2.0/24", az = 1, public = true }
    app_a    = { name = "private-backend-frontend-alb-us-east-2a", cidr = "10.0.11.0/24", az = 0, public = false }
    app_b    = { name = "private-backend-frontend-alb-us-east-2b", cidr = "10.0.12.0/24", az = 1, public = false }
    db_a     = { name = "private-db-us-east-2a", cidr = "10.0.21.0/24", az = 0, public = false }
    db_b     = { name = "private-db-us-east-2b", cidr = "10.0.22.0/24", az = 1, public = false }
  }
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}
resource "aws_subnet" "main" {
  for_each          = local.subnet_specs
  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value.cidr
  availability_zone = local.zones[each.value.az]
  tags              = { Name = each.value.name }
}
resource "aws_internet_gateway" "main" { vpc_id = aws_vpc.main.id }
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}
resource "aws_route_table" "private" { vpc_id = aws_vpc.main.id }
resource "aws_route_table_association" "main" {
  for_each       = local.subnet_specs
  subnet_id      = aws_subnet.main[each.key].id
  route_table_id = each.value.public ? aws_route_table.public.id : aws_route_table.private.id
}

resource "aws_security_group" "main" {
  for_each = toset(["public-alb", "frontend", "internal-alb", "backend", "database", "endpoints"])
  name     = "${local.name}-${each.key}"
  vpc_id   = aws_vpc.main.id
}
locals {
  connections = {
    public_frontend    = { from = "public-alb", to = "frontend", port = 8080 }
    frontend_internal  = { from = "frontend", to = "internal-alb", port = 80 }
    internal_backend   = { from = "internal-alb", to = "backend", port = 3000 }
    backend_database   = { from = "backend", to = "database", port = 5432 }
    frontend_endpoints = { from = "frontend", to = "endpoints", port = 443 }
    backend_endpoints  = { from = "backend", to = "endpoints", port = 443 }
  }
}
resource "aws_vpc_security_group_ingress_rule" "internet" {
  security_group_id = aws_security_group.main["public-alb"].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}
resource "aws_vpc_security_group_ingress_rule" "connection" {
  for_each                     = local.connections
  security_group_id            = aws_security_group.main[each.value.to].id
  referenced_security_group_id = aws_security_group.main[each.value.from].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
}
resource "aws_vpc_security_group_egress_rule" "connection" {
  for_each                     = local.connections
  security_group_id            = aws_security_group.main[each.value.from].id
  referenced_security_group_id = aws_security_group.main[each.value.to].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
}
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.us-east-2.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
}
resource "aws_vpc_security_group_egress_rule" "s3" {
  for_each          = toset(["frontend", "backend"])
  security_group_id = aws_security_group.main[each.key].id
  prefix_list_id    = aws_vpc_endpoint.s3.prefix_list_id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(["ecr.api", "ecr.dkr", "logs", "secretsmanager"])
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.us-east-2.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [aws_subnet.main["app_a"].id]
  security_group_ids  = [aws_security_group.main["endpoints"].id]
}

resource "aws_ecr_repository" "app" {
  for_each             = toset(["web", "api"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true
}
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy     = jsonencode({ rules = [{ rulePriority = 1, description = "Keep last 10 images", selection = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }, action = { type = "expire" } }] })
}
resource "aws_lb" "app" {
  for_each           = toset(["public", "internal"])
  name               = "contact-list-${each.key}"
  internal           = each.key == "internal"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.main["${each.key}-alb"].id]
  subnets            = each.key == "public" ? [aws_subnet.main["public_a"].id, aws_subnet.main["public_b"].id] : [aws_subnet.main["app_a"].id, aws_subnet.main["app_b"].id]
}
resource "aws_lb_target_group" "app" {
  for_each             = { web = 8080, api = 3000 }
  name                 = "contact-list-${each.key}"
  port                 = each.value
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 15
  health_check {
    path              = each.key == "web" ? "/" : "/health"
    healthy_threshold = 2
    interval          = 15
  }
}
resource "aws_lb_listener" "app" {
  for_each          = { public = "web", internal = "api" }
  load_balancer_arn = aws_lb.app[each.key].arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[each.value].arn
  }
}

resource "random_password" "secret" {
  for_each = toset(["database", "access", "refresh"])
  length   = 48
  special  = false
}
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/application"
  recovery_window_in_days = 0
}
resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({ DB_PASSWORD = random_password.secret["database"].result, JWT_ACCESS_SECRET = random_password.secret["access"].result, JWT_REFRESH_SECRET = random_password.secret["refresh"].result })
}
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = [aws_subnet.main["db_a"].id, aws_subnet.main["db_b"].id]
}
resource "aws_db_parameter_group" "main" {
  name   = local.name
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "0"
  }
}
resource "aws_db_instance" "main" {
  identifier              = local.name
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = "db.t4g.micro"
  allocated_storage       = 20
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = "contactos"
  username                = "contactos_app"
  password                = random_password.secret["database"].result
  db_subnet_group_name    = aws_db_subnet_group.main.name
  parameter_group_name    = aws_db_parameter_group.main.name
  vpc_security_group_ids  = [aws_security_group.main["database"].id]
  publicly_accessible     = false
  multi_az                = false
  availability_zone       = local.zones[0]
  backup_retention_period = 0
  skip_final_snapshot     = true
  deletion_protection     = false
}

resource "aws_ecs_cluster" "main" { name = local.name }
resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["web", "api"])
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = 3
}
resource "aws_iam_role" "execution" {
  name               = "${local.name}-execution"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "secrets" {
  role   = aws_iam_role.execution.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.app.arn }] })
}
resource "aws_ecs_task_definition" "app" {
  for_each                 = { web = var.web_image, api = var.api_image }
  family                   = "${local.name}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.execution.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([{
    name         = each.key
    image        = each.value
    essential    = true
    portMappings = [{ containerPort = each.key == "web" ? 8080 : 3000, protocol = "tcp" }]
    environment = each.key == "web" ? [{ name = "BACKEND_UPSTREAM", value = "http://${aws_lb.app["internal"].dns_name}" }] : [for k, v in {
      NODE_ENV = "production", PORT = "3000", DB_HOST = aws_db_instance.main.address, DB_PORT = "5432", DB_NAME = "contactos", DB_USER = "contactos_app", DB_SSL = "false", FRONTEND_ORIGIN = "http://${aws_lb.app["public"].dns_name}", CORS_ALLOW_ANY_ORIGIN = "false"
    } : { name = k, value = v }]
    secrets          = each.key == "web" ? [] : [for k in ["DB_PASSWORD", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] : { name = k, valueFrom = "${aws_secretsmanager_secret.app.arn}:${k}::" }]
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.app[each.key].name, "awslogs-region" = "us-east-2", "awslogs-stream-prefix" = "ecs" } }
  }])
}
resource "aws_ecs_service" "app" {
  for_each                           = { web = "frontend", api = "backend" }
  name                               = "${local.name}-${each.key}"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.app[each.key].arn
  desired_count                      = var.service_count
  launch_type                        = "FARGATE"
  platform_version                   = "1.4.0"
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = [aws_subnet.main["app_a"].id]
    security_groups  = [aws_security_group.main[each.value].id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.app[each.key].arn
    container_name   = each.key
    container_port   = each.key == "web" ? 8080 : 3000
  }
  lifecycle { ignore_changes = [task_definition, desired_count] }
  depends_on = [aws_lb_listener.app, aws_vpc_endpoint.interface, aws_secretsmanager_secret_version.app, aws_iam_role_policy_attachment.execution, aws_iam_role_policy.secrets]
}

output "deployment" {
  value = {
    cluster      = aws_ecs_cluster.main.name
    services     = { for k, v in aws_ecs_service.app : k => v.name }
    definitions  = { for k, v in aws_ecs_task_definition.app : k => v.arn }
    repositories = { for k, v in aws_ecr_repository.app : k => v.repository_url }
    subnet       = aws_subnet.main["app_a"].id
    backend_sg   = aws_security_group.main["backend"].id
    public_url   = "http://${aws_lb.app["public"].dns_name}"
  }
}
