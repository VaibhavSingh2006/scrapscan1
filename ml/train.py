"""
ScrapScan Training Script
Two-stage fine-tuning: freeze backbone → unfreeze all
"""
import os, shutil, random, time
from pathlib import Path
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
import numpy as np

from model import ScrapScanModel
from dataset import ScrapDataset, CLASS_KEYS
from augmentation import get_train_transform, get_val_transform

# ── CONFIG ──
DATA_DIR     = './data/split'
SAVE_DIR     = './checkpoints'
NUM_CLASSES  = 6
BATCH_SIZE   = 32
NUM_WORKERS  = 4
SEED         = 42

STAGE1_EPOCHS = 10
STAGE1_LR     = 3e-4

STAGE2_EPOCHS = 30
STAGE2_LR_BB  = 5e-5   # backbone
STAGE2_LR_HD  = 2e-4   # heads

WEIGHT_DECAY  = 1e-4
GRAD_CLIP     = 1.0
CLS_WEIGHT    = 1.0
ZINC_WEIGHT   = 0.4


def set_seed(seed):
    random.seed(seed); np.random.seed(seed)
    torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)


def compute_class_weights(dataset):
    counts = torch.zeros(NUM_CLASSES)
    for _, lbl, _ in dataset.samples:
        counts[lbl] += 1
    total = counts.sum()
    weights = total / (NUM_CLASSES * counts)
    return weights


def run_epoch(model, loader, cls_crit, zinc_crit, optimizer, device, train=True):
    model.train() if train else model.eval()
    total_loss, correct, total = 0.0, 0, 0
    ctx = torch.enable_grad() if train else torch.no_grad()
    with ctx:
        for batch in loader:
            imgs   = batch['image'].to(device)
            labels = batch['label'].to(device)
            zinc   = batch['zinc'].to(device)

            cls_logits, zinc_logit = model(imgs)
            cls_loss  = cls_crit(cls_logits, labels)
            zinc_loss = zinc_crit(zinc_logit.squeeze(1), zinc)
            loss = CLS_WEIGHT * cls_loss + ZINC_WEIGHT * zinc_loss

            if train:
                optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
                optimizer.step()

            total_loss += loss.item() * imgs.size(0)
            preds = cls_logits.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total   += imgs.size(0)

    return total_loss / total, correct / total


def main():
    set_seed(SEED)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f'Using device: {device}')
    os.makedirs(SAVE_DIR, exist_ok=True)

    train_ds = ScrapDataset(f'{DATA_DIR}/train', transform=get_train_transform())
    val_ds   = ScrapDataset(f'{DATA_DIR}/val',   transform=get_val_transform())
    train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=NUM_WORKERS, pin_memory=True)
    val_dl   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS, pin_memory=True)

    model = ScrapScanModel(num_classes=NUM_CLASSES, pretrained=True).to(device)
    class_weights = compute_class_weights(train_ds).to(device)
    cls_crit  = nn.CrossEntropyLoss(weight=class_weights)
    zinc_crit = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([5.0]).to(device))

    best_acc = 0.0

    # ── STAGE 1: freeze backbone ──
    print('\n=== STAGE 1: Training heads only ===')
    model.freeze_backbone()
    optimizer = AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=STAGE1_LR, weight_decay=WEIGHT_DECAY)
    scheduler = CosineAnnealingLR(optimizer, T_max=STAGE1_EPOCHS)

    for epoch in range(1, STAGE1_EPOCHS + 1):
        t0 = time.time()
        tr_loss, tr_acc = run_epoch(model, train_dl, cls_crit, zinc_crit, optimizer, device, train=True)
        vl_loss, vl_acc = run_epoch(model, val_dl,   cls_crit, zinc_crit, optimizer, device, train=False)
        scheduler.step()
        print(f'[S1 E{epoch:02d}] Loss: {tr_loss:.4f}/{vl_loss:.4f}  Acc: {tr_acc:.3f}/{vl_acc:.3f}  ({time.time()-t0:.0f}s)')
        if vl_acc > best_acc:
            best_acc = vl_acc
            torch.save(model.state_dict(), f'{SAVE_DIR}/best_model.pt')
            print(f'  ✅ Saved best (val_acc={best_acc:.4f})')

    # ── STAGE 2: unfreeze all ──
    print('\n=== STAGE 2: Fine-tuning all layers ===')
    model.unfreeze_backbone()
    optimizer = AdamW([
        {'params': model.backbone.parameters(),    'lr': STAGE2_LR_BB},
        {'params': model.classifier.parameters(),  'lr': STAGE2_LR_HD},
        {'params': model.zinc_detector.parameters(),'lr': STAGE2_LR_HD},
        {'params': model.dropout.parameters(),     'lr': STAGE2_LR_HD},
    ], weight_decay=WEIGHT_DECAY)
    scheduler = CosineAnnealingLR(optimizer, T_max=STAGE2_EPOCHS)

    for epoch in range(1, STAGE2_EPOCHS + 1):
        t0 = time.time()
        tr_loss, tr_acc = run_epoch(model, train_dl, cls_crit, zinc_crit, optimizer, device, train=True)
        vl_loss, vl_acc = run_epoch(model, val_dl,   cls_crit, zinc_crit, optimizer, device, train=False)
        scheduler.step()
        print(f'[S2 E{epoch:02d}] Loss: {tr_loss:.4f}/{vl_loss:.4f}  Acc: {tr_acc:.3f}/{vl_acc:.3f}  ({time.time()-t0:.0f}s)')
        if vl_acc > best_acc:
            best_acc = vl_acc
            torch.save(model.state_dict(), f'{SAVE_DIR}/best_model.pt')
            print(f'  ✅ Saved best (val_acc={best_acc:.4f})')

    print(f'\nTraining complete. Best val accuracy: {best_acc:.4f}')
    print(f'Checkpoint: {SAVE_DIR}/best_model.pt')
    print('Run export_onnx.py next.')


if __name__ == '__main__':
    main()
