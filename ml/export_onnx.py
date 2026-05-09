"""
ScrapScan ONNX Export Script
Exports trained PyTorch model to ONNX format for use with ONNX Runtime Web.
"""
import os, shutil
import torch
import onnx
import onnxruntime as ort
import numpy as np

from model import ScrapScanModel

CHECKPOINT = './checkpoints/best_model.pt'
OUTPUT     = './scrapscan_model.onnx'
NUM_CLASSES = 6
OPSET       = 11


def export():
    device = torch.device('cpu')
    model = ScrapScanModel(num_classes=NUM_CLASSES, pretrained=False)
    
    if not os.path.exists(CHECKPOINT):
        raise FileNotFoundError(f'Checkpoint not found: {CHECKPOINT}\nRun train.py first.')
    
    state = torch.load(CHECKPOINT, map_location=device)
    model.load_state_dict(state)
    model.eval()
    print(f'Loaded checkpoint: {CHECKPOINT}')

    dummy_input = torch.randn(1, 3, 224, 224)

    torch.onnx.export(
        model,
        dummy_input,
        OUTPUT,
        export_params=True,
        opset_version=OPSET,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['class_logits', 'zinc_logit'],
        dynamic_axes={'input': {0: 'batch_size'}}
    )
    print(f'Exported ONNX model: {OUTPUT}')

    # ── Verify ──
    model_onnx = onnx.load(OUTPUT)
    onnx.checker.check_model(model_onnx)
    print('ONNX model verification: PASSED')

    # ── ORT test ──
    sess = ort.InferenceSession(OUTPUT)
    dummy_np = dummy_input.numpy()
    out = sess.run(None, {'input': dummy_np})
    print(f'ORT test — class_logits shape: {out[0].shape}, zinc_logit shape: {out[1].shape}')
    print('ORT inference: PASSED')

    # ── Copy to public/models/ ──
    dest = '../public/models/scrapscan_model.onnx'
    shutil.copy(OUTPUT, dest)
    print(f'\nCopied to: {dest}')
    print('NEXT STEP: Restart npm start — the app will switch to Production Mode automatically.')


if __name__ == '__main__':
    export()
