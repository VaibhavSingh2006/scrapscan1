"""
ScrapScan EfficientNet-B0 Multi-task Model
IIM MATRIXx 2026 | IIT ISM Dhanbad
"""
import torch
import torch.nn as nn
import timm


class ScrapScanModel(nn.Module):
    """
    Multi-task EfficientNet-B0:
      - backbone: timm EfficientNet-B0 (feature extractor, 1280-dim)
      - classifier head: 6-class scrap type (IS 2314)
      - zinc_detector head: binary galvanization probability
    """
    def __init__(self, num_classes: int = 6, pretrained: bool = True):
        super().__init__()
        self.backbone = timm.create_model(
            'efficientnet_b0',
            pretrained=pretrained,
            num_classes=0,          # remove original classifier
            global_pool='avg'
        )
        feat_dim = self.backbone.num_features  # 1280

        self.dropout = nn.Dropout(p=0.3)

        # Scrap type classifier (6 classes)
        self.classifier = nn.Sequential(
            nn.Linear(feat_dim, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.2),
            nn.Linear(256, num_classes)
        )

        # Zinc / galvanization detector (binary)
        self.zinc_detector = nn.Sequential(
            nn.Linear(feat_dim, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.2),
            nn.Linear(128, 1)
            # sigmoid applied at inference; BCEWithLogitsLoss during training
        )

    def forward(self, x: torch.Tensor):
        features = self.backbone(x)          # [B, 1280]
        features = self.dropout(features)
        class_logits = self.classifier(features)   # [B, 6]
        zinc_logit   = self.zinc_detector(features) # [B, 1]
        return class_logits, zinc_logit

    def freeze_backbone(self):
        for param in self.backbone.parameters():
            param.requires_grad = False

    def unfreeze_backbone(self):
        for param in self.backbone.parameters():
            param.requires_grad = True


if __name__ == '__main__':
    model = ScrapScanModel(num_classes=6, pretrained=False)
    dummy = torch.randn(2, 3, 224, 224)
    cls_logits, zinc_logit = model(dummy)
    print(f'Class logits: {cls_logits.shape}')   # [2, 6]
    print(f'Zinc logit:   {zinc_logit.shape}')    # [2, 1]
    print('Model OK.')
