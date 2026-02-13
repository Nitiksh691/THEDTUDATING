import sys
import os

# Add the parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

# This file is the entry point for Vercel Serverless Functions.
# It exposes the `app` object from `main.py`.
