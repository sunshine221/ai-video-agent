-- ===============================================
-- AI 视频制作智能体 — 数据库建表 SQL
-- 数据库：MySQL 8.0+，字符集 utf8mb4
-- ===============================================

CREATE DATABASE IF NOT EXISTS `ai_video` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `ai_video`;

-- 项目表
CREATE TABLE IF NOT EXISTS `project` (
  `uuid`         VARCHAR(36)  NOT NULL,
  `title`        VARCHAR(255) NOT NULL,
  `type`         VARCHAR(16)  NOT NULL COMMENT 'image | html',
  `styleId`      VARCHAR(64)  NULL COMMENT 'HTML 模式选中的视觉风格 id',
  `outline`      JSON         NULL COMMENT '视频大纲（含分镜列表的 JSON）',
  `videoSource`  JSON         NULL COMMENT '视频源（图片/音频/HTML 代码的 JSON）',
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`uuid`),
  KEY `idx_project_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 消息表
CREATE TABLE IF NOT EXISTS `message` (
  `id`         VARCHAR(36)  NOT NULL,
  `projectId`  VARCHAR(36)  NOT NULL,
  `role`       VARCHAR(16)  NOT NULL COMMENT 'user | assistant',
  `content`    TEXT         NOT NULL,
  `metadata`   JSON         NULL COMMENT '结构化数据：大纲卡片/分镜卡片/进度等',
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_message_project_createdAt` (`projectId`, `createdAt`),
  CONSTRAINT `fk_message_project`
    FOREIGN KEY (`projectId`) REFERENCES `project` (`uuid`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
