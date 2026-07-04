FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY Backend/FormRequestSystem.Api.csproj Backend/
COPY Backend/Project/FormRequestSystem.Project.csproj Backend/Project/
RUN dotnet restore Backend/FormRequestSystem.Api.csproj

COPY Backend/ Backend/
RUN dotnet publish Backend/FormRequestSystem.Api.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/publish .
RUN mkdir -p /app/Data/signatures \
    && chown -R app:app /app

USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "FormRequestSystem.Api.dll"]

