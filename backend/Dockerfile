FROM python:3.11-slim

WORKDIR /app

# System deps for Pillow, PyMuPDF, python-pptx, LibreOffice
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    wget \
    fontconfig \
    libreoffice-impress \
    libreoffice-common \
    && rm -rf /var/lib/apt/lists/*

# Install Montserrat font and refresh font cache (LibreOffice reads fontconfig at runtime)
RUN mkdir -p /usr/share/fonts/montserrat && \
    wget -q "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf" \
         -O /usr/share/fonts/montserrat/Montserrat.ttf && \
    fc-cache -fv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Data directories (will be overridden by volume mount in production)
RUN mkdir -p data/uploads data/thumbnails data/exports

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
