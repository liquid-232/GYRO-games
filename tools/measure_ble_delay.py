"""同时接收 USB 与 BLE 的同一采样，测量蓝牙相对 USB 的接收时间差。"""
import argparse
import asyncio
import json
from pathlib import Path
import statistics
import struct
import sys
import threading
import time

SERVICE = '7b6a0001-8e7f-4a23-a83b-e55a7634cc01'
MOTION = SERVICE.replace('0001', '0002')


def crc16(data):
    crc = 0xffff
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021 if crc & 0x8000 else crc << 1) & 0xffff
    return crc


def command(op, ident):
    raw = b'GYC2' + struct.pack('<BI', op, ident)
    return raw + struct.pack('<H', crc16(raw))


def sample_key(data):
    if len(data) != 20 or data[:4] != b'GYB2' or data[16] != 5:
        return None
    return struct.unpack_from('<II', data, 4)


def percentile(values, fraction):
    values = sorted(values)
    return values[min(len(values) - 1, int((len(values) - 1) * fraction))]


def summarize(usb, ble):
    # 必须序号、采样时间和完整负载都相同；不以最近邻或插值代替同帧测量。
    pairs = []
    for key in usb.keys() & ble.keys():
        usb_ns, usb_payload = usb[key]
        ble_ns, ble_payload = ble[key]
        if usb_payload == ble_payload:
            pairs.append({'sequence': key[0], 'device_us': key[1],
                          'ble_minus_usb_ms': (ble_ns - usb_ns) / 1_000_000})
    pairs.sort(key=lambda row: row['sequence'])
    if not pairs:
        raise RuntimeError('两条通道没有相同采样，不能计算同帧延迟；请重试测量')
    values = [row['ble_minus_usb_ms'] for row in pairs]
    return {'usb_samples': len(usb), 'ble_samples': len(ble), 'matched_samples': len(pairs),
            'ble_minus_usb_ms': {'median': round(statistics.median(values), 3),
                                 'p95': round(percentile(values, .95), 3),
                                 'min': round(min(values), 3), 'max': round(max(values), 3)},
            'pairs': pairs}


async def measure(args):
    import serial
    from bleak import BleakClient, BleakScanner
    device = await BleakScanner.find_device_by_filter(
        lambda d, a: (d.name or '').startswith(args.name), timeout=10)
    if device is None:
        raise RuntimeError('未发现指定蓝牙控制器，请确认供电并断开游戏蓝牙连接')
    usb, ble, errors = {}, {}, []
    stopped = threading.Event()
    port = serial.Serial()
    port.port, port.baudrate, port.timeout = args.port, 115200, .01
    port.dtr = port.rts = False
    port.open()

    def read_usb():
        buffer = b''
        next_ping, ident = 0, 0
        try:
            while not stopped.is_set():
                now = time.perf_counter()
                if now >= next_ping:
                    ident += 1
                    port.write(command(2, ident))
                    next_ping = now + 1
                chunk = port.read(max(1, min(port.in_waiting, 4096)))
                received_ns = time.perf_counter_ns()
                buffer += chunk
                while len(buffer) >= 4:
                    size = 26 if buffer[:4] == b'GYU2' else 15 if buffer[:4] == b'GYA2' else 0
                    if not size:
                        buffer = buffer[1:]
                        continue
                    if len(buffer) < size:
                        break
                    raw = buffer[:size]
                    if crc16(raw[:-2]) != struct.unpack('<H', raw[-2:])[0]:
                        buffer = buffer[1:]
                        continue
                    buffer = buffer[size:]
                    if size == 26:
                        payload = raw[4:-2]
                        key = sample_key(payload)
                        if key is not None:
                            usb.setdefault(key, (received_ns, payload))
        except Exception as error:
            errors.append(str(error))
            stopped.set()

    def receive_ble(_, data):
        received_ns = time.perf_counter_ns()
        payload = bytes(data)
        key = sample_key(payload)
        if key is not None:
            ble.setdefault(key, (received_ns, payload))

    worker = None
    try:
        async with BleakClient(device, services=[SERVICE], timeout=30,
                               winrt={'use_cached_services': False}) as client:
            await client.start_notify(MOTION, receive_ble)
            worker = threading.Thread(target=read_usb, daemon=True)
            worker.start()
            print(f'Connected {device.name} + {args.port}; measuring {args.seconds:g}s', flush=True)
            deadline = time.perf_counter() + args.seconds
            while time.perf_counter() < deadline and not stopped.is_set():
                if not client.is_connected:
                    raise RuntimeError('测量期间蓝牙断开，结果不能作为完整测量')
                await asyncio.sleep(.1)
            await client.stop_notify(MOTION)
    finally:
        stopped.set()
        if worker is not None:
            worker.join(timeout=2)
        try:
            port.write(command(3, 0xffffffff))
        finally:
            port.close()
    if errors:
        raise RuntimeError('; '.join(errors))
    result = summarize(usb, ble)
    result.update({'device': device.name, 'serial_port': args.port, 'duration_s': args.seconds,
                   'measurement': 'BLE 接收时间减去 USB 接收时间（同采样、同电脑单调时钟）',
                   'limitations': '含主机驱动和回调调度差异；USB 延迟未扣除，不能视为蓝牙绝对单向延迟或游戏端到端延迟。负值保留，不截断。'})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in result.items() if key != 'pairs'}, ensure_ascii=False), flush=True)
    print(f'Report: {args.output.resolve()}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', default='COM29')
    parser.add_argument('--name', default='GYRO-C3-BLE-95BA')
    parser.add_argument('--seconds', type=float, default=30)
    parser.add_argument('--deps', type=Path, help='可选：独立安装的 bleak / pyserial 目录')
    parser.add_argument('--output', type=Path, default=Path('game/.runtime/ble-usb-delay.json'))
    args = parser.parse_args()
    if not 1 <= args.seconds <= 300:
        parser.error('--seconds 应介于 1 和 300')
    if args.deps:
        sys.path.insert(0, str(args.deps.resolve()))
    asyncio.run(measure(args))


if __name__ == '__main__':
    main()
