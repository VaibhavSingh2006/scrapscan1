import torch
import torch.nn as nn

class DummyScrapModel(nn.Module):
    def __init__(self):
        super().__init__()
        # 6 classes + 1 zinc
        self.conv = nn.Conv2d(3, 16, 3, stride=2, padding=1)
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Linear(16, 6)
        self.zinc = nn.Linear(16, 1)

    def forward(self, x):
        x = torch.relu(self.conv(x))
        x = self.pool(x).view(x.size(0), -1)
        return self.classifier(x), self.zinc(x)

model = DummyScrapModel()
model.eval()

dummy_input = torch.randn(1, 3, 224, 224)
torch.onnx.export(
    model, dummy_input, 'public/models/scrapscan_model.onnx',
    export_params=True,
    opset_version=11,
    do_constant_folding=True,
    input_names=['input'],
    output_names=['class_logits', 'zinc_logit'],
    dynamic_axes={'input': {0: 'batch_size'}}
)
print("Dummy model created.")
