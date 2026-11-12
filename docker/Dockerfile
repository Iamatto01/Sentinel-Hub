# ==============================================================================
# Sentinel Kali Linux Server — Ultimate Pentest & Orchestration Container
# Runs on NVMe SSD with Full Tooling, PM2, Node.js, Python, Metasploit, Cloudflared
# ==============================================================================

FROM kalilinux/kali-rolling

LABEL maintainer="Sentinel AI <admin@sentinelai.studio>"
LABEL description="Complete Kali Linux server with all pentest tools and Sentinel app stack"

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV HOME=/home/kali

# 1. Update Kali Repositories & Install Base System Utilities
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    apt-transport-https \
    ca-certificates \
    curl \
    wget \
    gnupg \
    lsb-release \
    git \
    sudo \
    procps \
    net-tools \
    iputils-ping \
    dnsutils \
    iproute2 \
    iptables \
    socat \
    netcat-traditional \
    tcpdump \
    traceroute \
    whois \
    tmux \
    nano \
    vim \
    htop \
    unzip \
    p7zip-full \
    build-essential \
    libsqlite3-dev \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Comprehensive Kali Pentest Tools Suite
RUN apt-get update && apt-get install -y --no-install-recommends \
    kali-tools-top10 \
    metasploit-framework \
    nmap \
    sqlmap \
    wireshark \
    tshark \
    aircrack-ng \
    john \
    hydra \
    nikto \
    wpscan \
    gobuster \
    dirsearch \
    sublist3r \
    wfuzz \
    hashcat \
    exploitdb \
    wordlists \
    && rm -rf /var/lib/apt/lists/*

# 3. Install Python 3, pip, venv & requirements
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    python3-requests \
    python3-paramiko \
    python3-psutil \
    && rm -rf /var/lib/apt/lists/*

# 4. Install Node.js LTS (v22.x) and PM2
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pm2 pm2-logrotate \
    && rm -rf /var/lib/apt/lists/*

# 5. Install Cloudflare Tunnel (cloudflared)
RUN curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
    && dpkg -i /tmp/cloudflared.deb \
    && rm /tmp/cloudflared.deb

# 6. Configure Kali User & Sudo Privileges
RUN useradd -m -s /bin/bash -u 1000 kali \
    && echo "kali:kali" | chpasswd \
    && usermod -aG sudo kali \
    && echo "kali ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && echo "Defaults !lecture" >> /etc/sudoers

# 7. Create server directories
RUN mkdir -p /home/kali/server /home/kali/.pm2 \
    && chown -R kali:kali /home/kali

WORKDIR /home/kali/server

# Expose all Sentinel service ports
# 3000: SentinelMaster Hub
# 3005: SentinelMLBB
# 3010: SentinelAPI
# 5000: SentinelAI Backend
# 5173: SentinelAI Frontend
# 8009: SentinelThreat
# 8016: SentinelWeb
# 8028: SentinelAlong
# 8029: SentinelArcuz100
# 20128: OmniRoute
# 55553: msfrpcd (Metasploit RPC)
EXPOSE 3000 3005 3010 5000 5173 8009 8016 8028 8029 20128 55553

USER kali

CMD ["/bin/bash"]
