using System.Data.Common;
using Dapper;
using MySqlConnector;

namespace GatePassSystem.Project.Repositories;

public sealed class MariaDbConnectionFactory(string connectionString) : IDatabaseConnectionFactory
{
    public async ValueTask<DbConnection> OpenConnectionAsync(
        CancellationToken cancellationToken = default)
    {
        var connection = new MySqlConnection(connectionString);
        try
        {
            await connection.OpenAsync(cancellationToken);
            await connection.ExecuteAsync(new CommandDefinition(
                "SET time_zone = '+00:00';",
                cancellationToken: cancellationToken));
            return connection;
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }
}
