#import "@preview/typst-apollo:0.1.0": pages
#import "@preview/shiroa:0.2.3": *
#import "@preview/unequivocal-ams:0.1.0": theorem, proof
#import pages: *

#show: project.with(
  title: "解锁 RTX 4060 Laptop",
  authors: (
    (
      name: "VZstless",
      email: "vzstless@gmail.com",
    ),
  ),
)

#set par(justify: true)

这个过程过于简单了，水一篇得了。我使用的机器是 ROG Zephyrus G14 2024 + Arch Linux 。

先找到一个 repo ，#link("https://github.com/JustAResearcher/gpu-unlock-ada")[gpu-unlock-ada] ，clone 之后使用如下方法在机器中编译并安装对应包：
```shell
make install-arch
sudo mkinitcpio -P
```
由于我的机器使用的是 Limine ，所以需要在 cmdline 后加半行启动选项：
```
/Arch Linux (linux)
    protocol: efi
    path: boot():/EFI/Linux/arch-linux.efi
    cmdline: root=PARTUUID=2fef8961-e3cd-46a5-ba36-d976353f35d6 zswap.enabled=0 rootflags=subvol=@ rw rootfstype=btrfs gpu_unlock.targets=0000:01:00.0 gpu_unlock.ad107_experimental=1
```
冷却 30s 后重启。

查看启动日志里是否出现了 unlock ：
```
sudo journalctl -k -b | grep gpu_unlock
[sudo] password for lumiere: 
Oct 27 14:50:03 wirbelwind kernel: Command line: root=PARTUUID=2fef8961-e3cd-46a5-ba36-d976353f35d6 zswap.enabled=0 rootflags=subvol=@ rw rootfstype=btrfs gpu_unlock.targets=0000:01:00.0 gpu_unlock.ad107_experimental=1
Oct 27 14:50:03 wirbelwind kernel: Kernel command line: root=PARTUUID=2fef8961-e3cd-46a5-ba36-d976353f35d6 zswap.enabled=0 rootflags=subvol=@ rw rootfstype=btrfs gpu_unlock.targets=0000:01:00.0 gpu_unlock.ad107_experimental=1
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: loading out-of-tree module taints kernel.
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: module verification failed: signature and/or required key missing - tainting kernel
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: ROM chain: pos=0x0 data=0x52494350 bytes=64512 type=0x0 last=0
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: ROM chain: pos=0xfc00 data=0x52494350 bytes=86016 type=0x3 last=0
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: ROM chain: pos=0x24c00 data=0x5344504e bytes=24576 type=0xe0 last=0
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: ROM chain: pos=0x2ac00 data=0x5344504e bytes=491008 type=0xe0 last=128
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: ROM expansion: base=0xfc00 ext=0x24c00 adjust=0x15000
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: ROM BIT: offset=0x1b0 size=12 stride=6 tokens=19 adjust=0x15000
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: ROM ucode table: offset=0xa282d version=1 header=6 stride=6 entries=16
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: FWSEC descriptor: offset=0x4581c ROM_bytes=1048576 header=0x32c0301
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: FWSEC geometry: image_off=0x45b48 size=0x10500 imem=0xf700 va=0x0 pa=0x0 dmem=0xd80 pa=0x0 pkc=0xb24 interface=0x1c engine=0x400 ucode=9 signatures=2 versions=0x3 bytes=768
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: FWSEC interface: offset=0x1c version=1 header=4 stride=8 entries=2 FRTS=0x1ffa00000
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: FWSEC mapper: version=3 size=64 cmd_offset=0xd40 cmd_size=64
Oct 27 14:50:03 wirbelwind kernel: gpu_unlock: FWSEC signature selection: versions=0x3 fuse_version=1 sig_bytes=384
Oct 27 14:50:03 wirbelwind kernel: pci 0000:01:00.0: gpu_unlock: unlocked
```
出现了，回到原 repo ，再检查一次：
```
$ python3 tools/read_sm_rates.py --expect-uuid GPU-666c50a2-aca8-340c-1aa7-70995d9d69fa
{"gpu": "GPU-666c50a2-aca8-340c-1aa7-70995d9d69fa, NVIDIA GeForce RTX 4060 Laptop GPU, 00000000:01:00.0, 615.78.08, [N/A], 210, 7001", "command": "0x20801230", "rates": {"imla0": 0, "fmla16": 0, "dp": 0, "fmla32": 0, "ffma": 0, "imla1": 0, "imla2": 0, "imla3": 0, "imla4": 0}, "meaning": "0=full; 1=half; 2=quarter; higher values are further reductions", "hardware_changes": false}
```
最后是压力测试，如下附件：

#if is-web-target [
  - #link("/attachments/4060laptop-unlock/cli-stressor-cuda-rs.log")[cli-stressor-cuda-rs.log]（宽泛的测试）
  - #link("/attachments/4060laptop-unlock/cli-stressor-cuda-rs-fp16.log")[cli-stressor-cuda-rs-fp16.log]（仅针对 fp16 且时间较长的压力测试）
]

#if is-pdf-target [
  #pdf.embed(
    "/static/attachments/4060laptop-unlock/cli-stressor-cuda-rs.log",
    relationship: "supplement",
    mime-type: "text/plain",
    description: "宽泛的测试",
  )

  #pdf.embed(
    "/static/attachments/4060laptop-unlock/cli-stressor-cuda-rs-fp16.log",
    relationship: "supplement",
    mime-type: "text/plain",
    description: "仅针对 fp16 且时间较长的压力测试",
  )
]
