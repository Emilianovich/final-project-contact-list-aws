terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {}
}
provider "aws" {
  region              = "us-east-2"
  allowed_account_ids = ["817345470591"]
}
variable "existing_oidc_provider_arn" {
  type        = string
  default     = ""
  description = "If GitHub OIDC already exists in this account, supply its ARN."
}
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.existing_oidc_provider_arn == "" ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
locals {
  prefix       = "final-project-contact-list"
  provider_arn = var.existing_oidc_provider_arn != "" ? var.existing_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
  state        = "arn:aws:s3:::terraform-state-817345470591"
}
resource "aws_iam_role" "github" {
  for_each           = toset(["infra", "build", "deploy"])
  name               = "${local.prefix}-github-${each.key}"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Federated = local.provider_arn }, Action = "sts:AssumeRoleWithWebIdentity", Condition = { StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com", "token.actions.githubusercontent.com:sub" = "repo:Emilianovich/final-project-contact-list-aws:environment:aws-dev" } } }] })
}
resource "aws_iam_role_policy" "state" {
  for_each = toset(["infra", "deploy"])
  role     = aws_iam_role.github[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket", "s3:GetBucketLocation"], Resource = local.state },
    { Effect = "Allow", Action = each.key == "infra" ? ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"] : ["s3:GetObject"], Resource = "${local.state}/final-project-contact-list/dev/*" }
  ] })
}
resource "aws_iam_role_policy" "infra" {
  role = aws_iam_role.github["infra"].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ec2:*", "elasticloadbalancing:*", "ecs:*", "ecr:*", "rds:*", "logs:*", "secretsmanager:*"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = "us-east-2" } } },
    { Effect = "Allow", Action = ["iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PassRole"], Resource = "arn:aws:iam::817345470591:role/${local.prefix}-execution" },
    { Effect = "Allow", Action = ["iam:CreateServiceLinkedRole"], Resource = "arn:aws:iam::817345470591:role/aws-service-role/*", Condition = { StringEquals = { "iam:AWSServiceName" = ["ecs.amazonaws.com", "elasticloadbalancing.amazonaws.com", "rds.amazonaws.com"] } } }
  ] })
}
resource "aws_iam_role_policy" "build" {
  role = aws_iam_role.github["build"].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:DescribeImages", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"], Resource = "arn:aws:ecr:us-east-2:817345470591:repository/${local.prefix}-*" }
  ] })
}
resource "aws_iam_role_policy" "deploy" {
  role = aws_iam_role.github["deploy"].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ecs:DescribeServices", "ecs:UpdateService"], Resource = "arn:aws:ecs:us-east-2:817345470591:service/${local.prefix}/*" },
    { Effect = "Allow", Action = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"], Resource = "*" },
    { Effect = "Allow", Action = ["ecs:RunTask"], Resource = "arn:aws:ecs:us-east-2:817345470591:task-definition/${local.prefix}-api:*", Condition = { ArnEquals = { "ecs:cluster" = "arn:aws:ecs:us-east-2:817345470591:cluster/${local.prefix}" } } },
    { Effect = "Allow", Action = ["ecs:DescribeTasks"], Resource = "arn:aws:ecs:us-east-2:817345470591:task/${local.prefix}/*" },
    { Effect = "Allow", Action = ["iam:PassRole"], Resource = "arn:aws:iam::817345470591:role/${local.prefix}-execution", Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } } }
  ] })
}
output "github_variables" {
  value = { for k, v in aws_iam_role.github : "AWS_${upper(k)}_ROLE_ARN" => v.arn }
}
