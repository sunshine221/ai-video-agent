/**
 * 零依赖雪花 ID 生成器。
 *
 * 结构（64 bit，输出为十进制字符串）：
 *   1 bit  符号位（恒 0，保证为正）
 *  41 bit  毫秒时间戳（相对自定义纪元 EPOCH）
 *  10 bit  机器 ID（由 SNOWFLAKE_MACHINE_ID 环境变量指定，默认 0，范围 0-1023）
 *  12 bit  同一毫秒内的序列号（范围 0-4095）
 *
 * 全部用 BigInt 运算，避免 JS Number 精度丢失。ID 单调递增、按时间有序，
 * 适合直接作为数据库主键（写入友好、天然有序）。
 */

// 自定义纪元：2024-01-01 00:00:00 UTC。之后可用约 69 年。
const EPOCH = 1704067200000n;

const MACHINE_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;

const MAX_MACHINE_ID = (1n << MACHINE_ID_BITS) - 1n; // 1023
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n; // 4095

const TIMESTAMP_SHIFT = MACHINE_ID_BITS + SEQUENCE_BITS; // 22
const MACHINE_ID_SHIFT = SEQUENCE_BITS; // 12

function resolveMachineId(): bigint {
  const raw = process.env.SNOWFLAKE_MACHINE_ID;
  const parsed = raw ? BigInt(Number.parseInt(raw, 10) || 0) : 0n;
  if (parsed < 0n || parsed > MAX_MACHINE_ID) {
    throw new Error(`SNOWFLAKE_MACHINE_ID 必须在 0-${MAX_MACHINE_ID} 之间`);
  }
  return parsed;
}

const machineId = resolveMachineId();

let lastTimestamp = -1n;
let sequence = 0n;

/** 生成下一个雪花 ID（十进制字符串）。 */
export function newId(): string {
  let timestamp = BigInt(Date.now());

  if (timestamp < lastTimestamp) {
    // 时钟回拨：自旋等待到追平上次时间戳，保证单调递增
    while (timestamp < lastTimestamp) {
      timestamp = BigInt(Date.now());
    }
  }

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1n) & MAX_SEQUENCE;
    if (sequence === 0n) {
      // 当前毫秒序列号用尽，自旋到下一毫秒
      while (timestamp <= lastTimestamp) {
        timestamp = BigInt(Date.now());
      }
    }
  } else {
    sequence = 0n;
  }

  lastTimestamp = timestamp;

  const id =
    ((timestamp - EPOCH) << TIMESTAMP_SHIFT) |
    (machineId << MACHINE_ID_SHIFT) |
    sequence;

  return id.toString();
}
