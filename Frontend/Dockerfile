FROM nginx:1.27-alpine

COPY Frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY Frontend /usr/share/nginx/html/Frontend
COPY Frontend/runtime-config.docker.js /usr/share/nginx/html/Frontend/runtime-config.js

EXPOSE 80
