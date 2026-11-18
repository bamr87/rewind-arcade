#!/usr/bin/env bash
# packages/ml/setup.sh - create packages/ml/.venv with the ML stack.
#
#   packages/ml/setup.sh            # CPU PyTorch (enough: emulation is the bottleneck)
#   packages/ml/setup.sh --rocm     # PyTorch for AMD GPUs (ROCm; RX 9000 needs 6.4+)
#   packages/ml/setup.sh --cuda     # PyTorch for NVIDIA GPUs
#
# Safe to re-run; upgrades in place. Nothing outside packages/ml/ changes.

set -o errexit
set -o nounset
set -o pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/.venv"
flavor=cpu
for arg in "$@"; do
  case "$arg" in
    --rocm) flavor=rocm ;;
    --cuda) flavor=cuda ;;
    --cpu)  flavor=cpu ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

PY="${PYTHON:-python3}"
"$PY" - <<'PYCHECK' || { echo "ml: needs Python 3.10 or newer (found: $("$PY" -V 2>&1))" >&2; exit 1; }
import sys
sys.exit(0 if sys.version_info >= (3, 10) else 1)
PYCHECK

echo "==> creating $VENV ($("$PY" -V 2>&1))"
"$PY" -m venv "$VENV"
"$VENV/bin/python" -m pip install --quiet --upgrade pip

# The index names change with every ROCm/CUDA release; override with
# PYTORCH_INDEX=https://download.pytorch.org/whl/<name> when a newer one exists.
case "$flavor" in
  cpu)  index="https://download.pytorch.org/whl/cpu" ;;
  rocm) index="https://download.pytorch.org/whl/rocm10.0" ;;
  cuda) index="https://download.pytorch.org/whl/cu128" ;;
esac
index="${PYTORCH_INDEX:-$index}"
# pip counts torch 2.15.0+cpu as satisfying "torch", so switching builds
# needs the old one removed first.
have="$("$VENV/bin/python" -c 'import torch; print("rocm" if torch.version.hip else "cuda" if torch.version.cuda else "cpu")' 2>/dev/null || true)"
if [[ -n "$have" && "$have" != "$flavor" ]]; then
  echo "==> replacing the $have build of PyTorch with $flavor"
  "$VENV/bin/python" -m pip uninstall -y torch torchvision torchaudio pytorch-triton-rocm triton >/dev/null 2>&1 || true
fi
echo "==> installing PyTorch ($flavor) from $index"
"$VENV/bin/python" -m pip install --upgrade torch --index-url "$index"

echo "==> installing the rest (requirements.txt)"
"$VENV/bin/python" -m pip install --upgrade -r "$HERE/requirements.txt"

echo "==> verifying"
"$VENV/bin/python" - <<'PYVERIFY'
import gymnasium, numpy, stable_baselines3, torch
gpu = torch.cuda.is_available()
print(f"  torch {torch.__version__}  gymnasium {gymnasium.__version__}  "
      f"stable-baselines3 {stable_baselines3.__version__}  numpy {numpy.__version__}")
print(f"  accelerator: {torch.cuda.get_device_name(0) if gpu else 'none (CPU)'}"
      + (f"  (ROCm/HIP {torch.version.hip})" if gpu and torch.version.hip else ""))
if gpu:
    x = torch.randn(2048, 2048, device="cuda")
    print(f"  GPU matmul ok: {float((x @ x).sum().abs()) > 0}")
PYVERIFY
echo "==> ready: ./bin/retropi ml check"
