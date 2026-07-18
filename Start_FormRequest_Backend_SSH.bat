@echo off
set ASPNETCORE_ENVIRONMENT=Development
set ASPNETCORE_URLS=http://0.0.0.0:5087
set GATEPASS_DB_CONNECTION=Server=127.0.0.1;Port=3306;Database=gate_pass_system;User ID=root;Password=;Allow User Variables=True;SslMode=None
set Cors__AllowAnyOrigin=true
cd /d C:\FormRequestSystem.Api
FormRequestSystem.Api.exe
