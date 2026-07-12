# Local models for Tabs (Phase 1+2 per plan)
# Small ONNX/GGUF for offline fallback summarization/classification.
# Symlink (preferred; no full copies) from WaldoAI/models/ or WaldoSpells/models/ as needed.
# Primary path remains ollama/provider-driven.
#
# Examples:
#   ln -s ../../WaldoAI/models/phi-4-mini-q4 .
#   ln -s ../../WaldoAI/models/phi-3-mini-onnx-int4 .   # Edge/ONNX experiments
# Use in tests or local fallback for offline summary/classify.
