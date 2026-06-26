using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using MySqlConnector;
using Dapper;
using GatePassSystem.Project.Services;

namespace GatePassSystem.EmployeeImporter;

class Program
{
    static async Task Main(string[] args)
    {
        string connStr = "Server=127.0.0.1;Port=3306;Database=gate_pass_system;User ID=root;Password=;Allow User Variables=True;SslMode=None";
        using var connection = new MySqlConnection(connStr);
        await connection.OpenAsync();
        Console.WriteLine("Connected to database successfully!");

        // 1. Hash "Password123!" and update G001
        var hasher = new Pbkdf2PasswordHasher();
        var hash = hasher.Hash("Password123!");
        await connection.ExecuteAsync(
            "UPDATE tbl_user_accounts SET password_hash = @Hash WHERE username = 'G001'",
            new { Hash = hash }
        );
        Console.WriteLine("Updated G001 password hash in database.");

        // 2. Perform HTTP test
        using var client = new HttpClient();
        client.BaseAddress = new Uri("http://localhost:5087");

        Console.WriteLine("Logging in as Guard Hans (G001)...");
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "G001",
            password = "Password123!"
        });

        if (!loginResponse.IsSuccessStatusCode)
        {
            Console.WriteLine($"Login failed: {loginResponse.StatusCode}");
            var errContent = await loginResponse.Content.ReadAsStringAsync();
            Console.WriteLine(errContent);
            return;
        }

        var loginResult = await loginResponse.Content.ReadFromJsonAsync<JsonElement>();
        var token = loginResult.GetProperty("data").GetProperty("accessToken").GetString();
        Console.WriteLine("Login successful! Token retrieved.");

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Call 1: employee/by-id/GA153/passes
        Console.WriteLine("\n--- CALLING GET /api/security/employee/by-id/GA153/passes ---");
        var res1 = await client.GetAsync("/api/security/employee/by-id/GA153/passes");
        Console.WriteLine($"Status: {res1.StatusCode}");
        var content1 = await res1.Content.ReadAsStringAsync();
        Console.WriteLine(PrettyPrintJson(content1));

        // Call 2: employee/19/passes
        Console.WriteLine("\n--- CALLING GET /api/security/employee/19/passes ---");
        var res2 = await client.GetAsync("/api/security/employee/19/passes");
        Console.WriteLine($"Status: {res2.StatusCode}");
        var content2 = await res2.Content.ReadAsStringAsync();
        Console.WriteLine(PrettyPrintJson(content2));
    }

    static string PrettyPrintJson(string unPrettyJson)
    {
        try
        {
            var options = new JsonSerializerOptions { WriteIndented = true };
            using var jsonDoc = JsonDocument.Parse(unPrettyJson);
            return JsonSerializer.Serialize(jsonDoc, options);
        }
        catch
        {
            return unPrettyJson;
        }
    }
}
