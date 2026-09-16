-- AlterTable：项目表新增创作简报字段（唯一事实来源）
ALTER TABLE `project` ADD COLUMN `brief` JSON NULL;
