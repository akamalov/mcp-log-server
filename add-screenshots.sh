#!/bin/bash

# MCP Log Server - Add Screenshots Script
# This script helps you add the screenshots to the repository

echo "🖼️  MCP Log Server - Adding Screenshots"
echo "======================================="
echo ""

# Ensure the screenshots directory exists
mkdir -p docs/images/screenshots

echo "📁 Screenshot directory ready: docs/images/screenshots/"
echo ""
echo "📸 Please save your screenshots with these exact names:"
echo ""
echo "   1. Dashboard screenshot → docs/images/screenshots/dashboard.png"
echo "   2. Log Viewer screenshot → docs/images/screenshots/log-viewer.png" 
echo "   3. Agent Manager screenshot → docs/images/screenshots/agent-manager.png"
echo "   4. Enhanced Analytics screenshot → docs/images/screenshots/enhanced-analytics.png"
echo ""
echo "💡 Tips:"
echo "   • Use PNG format for best quality"
echo "   • Recommended size: 1200x800px or higher"
echo "   • Ensure screenshots show clean, professional interface"
echo ""
echo "🔧 After adding screenshots, run:"
echo "   git add docs/images/screenshots/*.png"
echo "   git commit -m \"docs: Add application screenshots\""
echo "   git push origin master"
echo ""
echo "✅ The README.md is already configured to use these paths!" 