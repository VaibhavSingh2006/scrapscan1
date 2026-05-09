Place scrapscan_model.onnx here after training on Google Colab.
See ml/ScrapScan_Training.ipynb and the main README.md for instructions.
The app runs in Demo Mode until this file is present.

Expected file: scrapscan_model.onnx (~20-25 MB)
Input:  float32[batch, 3, 224, 224] — ImageNet-normalized RGB
Outputs:
  - class_logits  float32[batch, 6]  — raw logits for 6 scrap classes
  - zinc_logit    float32[batch, 1]  — galvanization probability (after sigmoid)

Classes (index → label):
  0: HMS-1 Heavy Steel
  1: HMS-2 Light Steel
  2: Galvanized Steel
  3: Stainless Steel
  4: Non-Ferrous
  5: Mixed/Contaminated
