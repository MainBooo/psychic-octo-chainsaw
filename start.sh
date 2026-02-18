#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 MOEX Trading Bot - Quick Start Script${NC}"
echo ""

# Проверка .env файла
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found${NC}"
    echo -e "Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${GREEN}✅ .env created${NC}"
    echo -e "${RED}⚠️  Please edit .env file with your credentials before continuing${NC}"
    echo -e "Run: ${YELLOW}nano .env${NC}"
    exit 1
fi

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo -e "Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}❌ Node.js version must be 20 or higher (current: $(node -v))${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) detected${NC}"

# Меню выбора
echo ""
echo "Choose deployment method:"
echo "1) Docker (recommended)"
echo "2) PM2"
echo "3) Direct Node.js"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo -e "${GREEN}🐳 Starting with Docker...${NC}"
        
        # Проверка Docker
        if ! command -v docker &> /dev/null; then
            echo -e "${RED}❌ Docker is not installed${NC}"
            echo -e "Install Docker: ${YELLOW}curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}Building Docker image...${NC}"
        docker-compose build
        
        echo -e "${GREEN}Starting containers...${NC}"
        docker-compose up -d
        
        echo -e "${GREEN}✅ Bot started with Docker${NC}"
        echo -e "Check status: ${YELLOW}docker-compose ps${NC}"
        echo -e "View logs: ${YELLOW}docker-compose logs -f bot${NC}"
        echo -e "Health check: ${YELLOW}curl http://localhost:3000/health${NC}"
        ;;
        
    2)
        echo -e "${GREEN}🔄 Starting with PM2...${NC}"
        
        # Проверка PM2
        if ! command -v pm2 &> /dev/null; then
            echo -e "${YELLOW}PM2 not found, installing...${NC}"
            npm install -g pm2
        fi
        
        echo -e "${GREEN}Installing dependencies...${NC}"
        npm ci --only=production
        
        echo -e "${GREEN}Building application...${NC}"
        npm run build
        
        echo -e "${GREEN}Starting with PM2...${NC}"
        pm2 start ecosystem.config.cjs
        
        echo -e "${GREEN}✅ Bot started with PM2${NC}"
        echo -e "Check status: ${YELLOW}pm2 status${NC}"
        echo -e "View logs: ${YELLOW}pm2 logs moex-bot${NC}"
        echo -e "Monitor: ${YELLOW}pm2 monit${NC}"
        ;;
        
    3)
        echo -e "${GREEN}📦 Starting directly with Node.js...${NC}"
        
        echo -e "${GREEN}Installing dependencies...${NC}"
        npm ci --only=production
        
        echo -e "${GREEN}Building application...${NC}"
        npm run build
        
        echo -e "${GREEN}Starting bot...${NC}"
        npm start
        ;;
        
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  • Monitor logs for any errors"
echo "  • Test Telegram bot functionality"
echo "  • Check health endpoint: http://localhost:3000/health"
echo ""
echo "For more information, see README.md"
