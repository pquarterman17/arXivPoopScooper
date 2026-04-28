@echo off
title ScientificLitterScoop
echo Starting ScientificLitterScoop server...
echo.
python "%~dp0serve.py" %*
if errorlevel 1 (
    echo.
    echo Python not found. Please install Python 3 from python.org
    echo or the Microsoft Store, then try again.
    echo.
    pause
)
