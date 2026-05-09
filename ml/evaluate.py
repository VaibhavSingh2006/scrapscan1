"""
ScrapScan Evaluation: Confusion Matrix + Classification Report
"""
import torch
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader

from model import ScrapScanModel
from dataset import ScrapDataset, CLASS_KEYS
from augmentation import get_val_transform

CHECKPOINT  = './checkpoints/best_model.pt'
TEST_DIR    = './data/split/test'
BATCH_SIZE  = 32
NUM_CLASSES = 6


def evaluate():
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = ScrapScanModel(num_classes=NUM_CLASSES, pretrained=False)
    model.load_state_dict(torch.load(CHECKPOINT, map_location=device))
    model.eval().to(device)

    test_ds = ScrapDataset(TEST_DIR, transform=get_val_transform())
    test_dl = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    all_preds, all_labels, all_zinc_pred, all_zinc_true = [], [], [], []

    with torch.no_grad():
        for batch in test_dl:
            imgs   = batch['image'].to(device)
            labels = batch['label']
            zinc   = batch['zinc']
            cls_logits, zinc_logit = model(imgs)
            preds = cls_logits.argmax(dim=1).cpu()
            zinc_preds = (torch.sigmoid(zinc_logit.squeeze(1)) > 0.5).cpu().float()
            all_preds.extend(preds.numpy())
            all_labels.extend(labels.numpy())
            all_zinc_pred.extend(zinc_preds.numpy())
            all_zinc_true.extend(zinc.numpy())

    print('\n=== CLASSIFICATION REPORT ===')
    print(classification_report(all_labels, all_preds, target_names=CLASS_KEYS))

    zinc_acc = np.mean(np.array(all_zinc_pred) == np.array(all_zinc_true))
    print(f'Zinc Detector Accuracy: {zinc_acc:.4f}')

    # Confusion matrix
    cm = confusion_matrix(all_labels, all_preds)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Reds',
                xticklabels=CLASS_KEYS, yticklabels=CLASS_KEYS)
    plt.title('ScrapScan Confusion Matrix')
    plt.ylabel('True Label'); plt.xlabel('Predicted')
    plt.tight_layout()
    plt.savefig('./confusion_matrix.png', dpi=150)
    print('Saved: confusion_matrix.png')
    plt.show()


if __name__ == '__main__':
    evaluate()
