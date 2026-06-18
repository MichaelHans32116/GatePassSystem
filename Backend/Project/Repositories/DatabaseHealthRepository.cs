using Dapper;

namespace GatePassSystem.Project.Repositories;

public sealed class DatabaseHealthRepository(
    IDatabaseConnectionFactory connectionFactory) : IDatabaseHealthRepository
{
    public async Task<bool> CanConnectAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = await connectionFactory.OpenConnectionAsync(cancellationToken);
            return await connection.ExecuteScalarAsync<int>(
                new CommandDefinition("SELECT 1;", cancellationToken: cancellationToken)) == 1;
        }
        catch
        {
            return false;
        }
    }
}
