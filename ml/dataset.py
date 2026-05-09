"""
ScrapScan Dataset class
"""
import os
import json
from pathlib import Path
from PIL import Image
import torch
from torch.utils.data import Dataset


CLASS_KEYS = ['hms1', 'hms2', 'galv', 'ss', 'nonfe', 'mixed']
ZINC_CLASSES = {'galv'}   # classes that are zinc-positive


class ScrapDataset(Dataset):
    """
    Folder structure expected:
        root/
          hms1/  img1.jpg  img2.jpg ...
          hms2/  ...
          galv/  ...
          ss/    ...
          nonfe/ ...
          mixed/ ...
    """
    def __init__(self, root_dir: str, transform=None, class_keys=None):
        self.root_dir = Path(root_dir)
        self.transform = transform
        self.class_keys = class_keys or CLASS_KEYS
        self.class_to_idx = {k: i for i, k in enumerate(self.class_keys)}

        self.samples = []   # [(img_path, class_idx, zinc_label)]
        for cls_key in self.class_keys:
            cls_dir = self.root_dir / cls_key
            if not cls_dir.exists():
                print(f'WARNING: class directory not found: {cls_dir}')
                continue
            zinc_label = 1.0 if cls_key in ZINC_CLASSES else 0.0
            for ext in ('*.jpg', '*.jpeg', '*.png', '*.webp', '*.bmp'):
                for img_path in cls_dir.rglob(ext):
                    self.samples.append((str(img_path), self.class_to_idx[cls_key], zinc_label))

        print(f'Dataset loaded: {len(self.samples)} images across {len(self.class_keys)} classes')
        self._print_class_counts()

    def _print_class_counts(self):
        counts = {}
        for _, cls_idx, _ in self.samples:
            k = self.class_keys[cls_idx]
            counts[k] = counts.get(k, 0) + 1
        for k, v in counts.items():
            print(f'  {k:8s}: {v:5d} images')

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, class_idx, zinc_label = self.samples[idx]
        try:
            img = Image.open(img_path).convert('RGB')
        except Exception as e:
            print(f'WARN: failed to load {img_path}: {e}')
            img = Image.new('RGB', (224, 224), color=(128, 128, 128))

        if self.transform:
            import numpy as np
            img_np = np.array(img)
            transformed = self.transform(image=img_np)
            img_tensor = transformed['image']
        else:
            from torchvision import transforms
            img_tensor = transforms.ToTensor()(img)

        return {
            'image': img_tensor,
            'label': torch.tensor(class_idx, dtype=torch.long),
            'zinc':  torch.tensor(zinc_label, dtype=torch.float32)
        }
