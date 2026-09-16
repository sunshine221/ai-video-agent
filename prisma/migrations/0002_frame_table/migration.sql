-- ===============================================
-- 迁移 0002：拆出 frame 表
-- 把 project.videoSource 里逐帧的 htmlCode/imagePath/audioPath 拆成独立行，
-- 消除整列 JSON 写放大与并发覆盖问题。
-- 数据库：MySQL 8.0+（依赖 JSON_TABLE）
-- ===============================================

-- 1) 新建 frame 表
CREATE TABLE IF NOT EXISTS `frame` (
  `id`             VARCHAR(36)  NOT NULL,
  `projectId`      VARCHAR(36)  NOT NULL,
  `frameId`        VARCHAR(191) NOT NULL COMMENT '对应 outline.frames[i].id',
  `orderIndex`     INT          NOT NULL COMMENT '与 outline 顺序对齐（0-based）',
  `htmlCode`       LONGTEXT     NULL COMMENT 'html 模式生成的完整 HTML',
  `imagePath`      VARCHAR(512) NULL,
  `audioPath`      VARCHAR(512) NULL,
  `audioDuration`  DOUBLE       NULL COMMENT '秒',
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_frame_project_frameId` (`projectId`, `frameId`),
  -- 逻辑外键：仅建索引，不建物理外键约束，关系由应用层维护
  KEY `idx_frame_project_order` (`projectId`, `orderIndex`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) 从旧的 project.videoSource JSON 迁移数据
INSERT INTO `frame`
  (`id`, `projectId`, `frameId`, `orderIndex`, `htmlCode`, `imagePath`, `audioPath`, `audioDuration`)
SELECT
  UUID(),
  p.`uuid`,
  jt.`frameId`,
  jt.`ordinal` - 1,
  jt.`htmlCode`,
  jt.`imagePath`,
  jt.`audioPath`,
  jt.`audioDuration`
FROM `project` p
JOIN JSON_TABLE(
  p.`videoSource`,
  '$.frames[*]' COLUMNS (
    `ordinal`       FOR ORDINALITY,
    `frameId`       VARCHAR(191) PATH '$.id',
    `htmlCode`      LONGTEXT     PATH '$.htmlCode',
    `imagePath`     VARCHAR(512) PATH '$.imagePath',
    `audioPath`     VARCHAR(512) PATH '$.audioPath',
    `audioDuration` DOUBLE       PATH '$.audioDuration'
  )
) jt
WHERE p.`videoSource` IS NOT NULL
  AND jt.`frameId` IS NOT NULL;

-- 3) 删除 project.videoSource 列
ALTER TABLE `project` DROP COLUMN `videoSource`;
