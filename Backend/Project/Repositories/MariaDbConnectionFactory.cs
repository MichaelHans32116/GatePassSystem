using System.Data.Common;
using MySqlConnector;

namespace GatePassSystem.Project.Repositories;

public sealed class MariaDbConnectionFactory(string connectionString) : IDatabaseConnectionFactory
{
    public async ValueTask<DbConnection> OpenConnectionAsync(
        CancellationToken cancellationToken = default)
    {
        var connection = new MySqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }
}
