import sys
import os

# Add the parent directory to sys.path to find main.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

# Vercel needs to see 'app' variable
app = app
