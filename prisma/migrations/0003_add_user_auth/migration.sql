-- ===============================================
-- 迁移 0003：新增 user 表 + project.userId
-- 邮箱 + 密码登录所需的用户体系
-- 数据库：MySQL 8.0+，字符集 utf8mb4
-- ===============================================

-- 1) 用户表
CREATE TABLE IF NOT EXISTS `user` (
  `id`           VARCHAR(36)  NOT NULL,
  `email`        VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL COMMENT 'bcrypt 哈希后的密码',
  `name`         VARCHAR(191) NULL COMMENT '显示名，可空',
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) project 增加 userId 列（可空，兼容旧数据）
ALTER TABLE `project`
  ADD COLUMN `userId` VARCHAR(36) NULL COMMENT '归属用户；旧项目可能为空';

-- 3) 索引（逻辑外键：仅建索引，不建物理外键约束，关系由应用层维护）
ALTER TABLE `project`
  ADD KEY `idx_project_userId` (`userId`);
