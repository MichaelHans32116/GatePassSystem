# 🚀 Complete Project & AWS Deployment Summary (For Review / ChatGPT Handoff)

**Student / Project Lead:** Michael Hans (Hanz)  
**Course / Subject:** ITELEC4 (Cloud Computing / Systems Deployment)  
**Date:** August 29, 2026  

---

## 1. 🏗️ Project Overview

Mayroong dalawang (2) buong web applications na sabay na tumatakbo sa **iisang AWS EC2 instance (`t3.micro`)**:

### A. Gate Pass System (`moriroku-gatepass.100.30.204.49.nip.io`)
* **Frontend**: Vanilla JavaScript (ES6+), Tailwind CSS, Custom Responsive UI, Animated Splash Intro (`splashPop`), Login Entrance hand-off (`loginHeroIn`/`loginRiseIn`).
* **Backend API**: ASP.NET Core 8 Web API (`/api/auth`, `/api/gatepassrequests`, `/api/approvals`, etc.).
* **Database**: MariaDB 11.4 na may kumpletong **96 master employees**, 97 user accounts, roles, departments, positions, fixed vehicle fleet schedules, at stored procedures.

### B. HRAD Ticketing System (`moriroku-hrad-ticketing.100.30.204.49.nip.io`)
* **Frontend**: HTML5, Tailwind CSS, FontAwesome, Matching Animated Splash Intro, Center Glassmorphic Login Card over subtle factory image.
* **Backend API**: ASP.NET Core 8 Web API (`/api/auth`, `/api/tickets`, `/api/dashboard`, etc.).
* **Database**: MariaDB 11.4 na may isolation at independent storage volume.

---

## 2. 🌐 Cloud Architecture & Host Routing (AWS EC2)

### 📌 Architecture Stack:
* **Server**: AWS EC2 Instance (`i-011c1aa8121500156`, `t3.micro`, Amazon Linux 2023).
* **Port 80 Ingress**: Isang central **Nginx Reverse Proxy Gateway** (`moriroku-gateway`) na nakikinig sa Port 80.
* **Docker Network (`gatepass-net`)**: Lahat ng 7 containers ay magkakasama sa isang isolated bridge network:
  1. `moriroku-gateway` (Port 80 router)
  2. `frontend` (Gate Pass UI on Nginx)
  3. `api` (Gate Pass .NET 8 API)
  4. `db` (Gate Pass MariaDB with named volume `gatepass_database`)
  5. `hrad-frontend` (HRAD UI on Nginx)
  6. `hrad-api` (HRAD .NET 8 API)
  7. `hrad-db` (HRAD MariaDB with named volume `hrad_database`)

### 📌 Paano nagka-Hostname nang Walang Biniling Domain (`nip.io`):
* Ginamit ang **`nip.io` (Wildcard DNS Resolver)**:
  * `moriroku-gatepass.100.30.204.49.nip.io` -> Nagre-resolve sa IP `100.30.204.49`.
  * `moriroku-hrad-ticketing.100.30.204.49.nip.io` -> Nagre-resolve sa IP `100.30.204.49`.
* Pagdating sa Port 80 ng EC2, binabasa ng Nginx ang `Host:` header at ipinapasa sa tamang container nang walang port conflict.

---

## 3. 📱 Social Link Previews (OpenGraph Metadata)
* Gumawa at nag-deploy ng high-resolution **1200x630 OpenGraph cards**:
  * **Gate Pass**: 60/40 Split-screen realistic login mockup (`Frontend/Design/images/og-preview.jpg`).
  * **HRAD Ticketing**: Full factory background na may center glass login card (`Design/images/og-preview.jpg`).
* Na-optimize sa ~75–85 KB lightweight JPEG para agad ma-scrape at ma-render sa Facebook Messenger, Discord, at Viber.

---

## 4. 🏫 Ano ang Nangyari sa Klase / Interaction kay Prof. Joseph

1. **Submission ng Links**:
   * Nag-submit si Michael Hans ng link bago mag-deadline.
2. **Checking ng Professor**:
   * Chine-check ni Sir Joseph ang submissions. Marami sa mga kaklase ang `"Not loading"` ang website kapag binuksan ni Sir dahil pinatay na nila ang PuTTY sa laptop nila.
   * Pag-check ni Sir sa link ni Michael Hans, **100% WORKING AT ONLINE ITO**.
3. **Ang Tanong ni Sir**:
   * Tinanong ni Sir si Michael Hans sa group chat:  
     > *"@Michael Hans Magbojos kapag nag close ka ng putty - nag down din ang website mo?"*
   * Sumagot si Michael Hans:  
     > *"hindi po sir kasi nag docker po ako para po doon sa database at backend"*
   * Nag-react si Sir ng **👍 (Thumbs Up)** sa message ni Michael Hans.
4. **Surveillance sa Buong Klase**:
   * Tinanong ni Sir ang buong klase: *"Sa lahat ng nagsubmit kindly answer this: Kapag nag close kayo ng putty, nag stop/down din ba ang website Nyo?"*
   * Halos lahat ng kaklase ay sumagot ng *"Yes po / nag stop po"*.
5. **Ang Announcement ni Sir**:
   * *"Lahat ng nag join sa contest - exempted na sa quiz for midterm."* -> **Exempted na si Michael Hans sa Midterm Quiz.**
   * *"Lahat ng dependent sa putty, may chance ma exempted sa midterm exam"* -> Sinabi ni Sir na ang chance para ma-exempt sa Midterm Exam ay para sa mga "putty dependent" dahil ang Nginx/Docker ay advance at hindi pa official part ng current lesson syllabus nila.

---

## 5. 🎯 Wednesday Defense & Live Demo Guide (Quick Reviewer)

Kung sakaling ipagawa o ipa-explain ni Sir sa Wednesday:

### Option 1: Kung hihingin ang DOCKER way (Current Production Setup)
```bash
# 1. SSH sa EC2
ssh -i "AlexHans-itelec-keypair.pem" ec2-user@<IP>

# 2. Network setup
sudo docker network create gatepass-net

# 3. Start Database
sudo docker run -d --name db --restart unless-stopped --network gatepass-net -v gatepass_database:/var/lib/mysql -e MARIADB_DATABASE=gate_pass_system -e MARIADB_USER=gatepass -e MARIADB_PASSWORD=secret_password mariadb:11.4

# 4. Build & Run API and Frontend
sudo docker build -t gatepass-api -f Backend/Dockerfile .
sudo docker run -d --name api --restart unless-stopped --network gatepass-net gatepass-api

sudo docker build -t gatepass-frontend -f Frontend/Dockerfile .
sudo docker run -d --name frontend --restart unless-stopped --network gatepass-net gatepass-frontend

# 5. Start Port 80 Gateway
sudo docker run -d --name moriroku-gateway --restart unless-stopped --network gatepass-net -p 80:80 -v /home/ec2-user/gateway/gateway-nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine
```

### Option 2: Kung ipagawa ang BASIC / PUTTY-DEPENDENT way (Standard Classroom Scope)
```bash
# 1. Install SDK & DB sa EC2 OS
sudo dnf install -y dotnet-sdk-8.0 mariadb105-server
sudo systemctl start mariadb

# 2. Run API directly sa foreground ng PuTTY
cd ~/GatePassSystem/Backend
dotnet run --urls "http://0.0.0.0:80"
# (Mananatiling live habang bukas ang PuTTY; magda-down kapag in-exit ang PuTTY)
```

---

## 6. 💰 Cloud Cost & Status
* Naka-configure ang auto-restart policy (`--restart unless-stopped`).
* Kapag naka-Stop ang EC2 instance sa AWS Console, **$0.00** ang compute charges habang nananatiling 100% safe ang lahat ng database records at code sa persistent storage.