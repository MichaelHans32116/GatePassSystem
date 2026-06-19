using System.Data.Common;

namespace GatePassSystem.Project.Repositories;

public interface IDatabaseConnectionFactory
{
    ValueTask<DbConnection> OpenConnectionAsync(CancellationToken cancellationToken = default);
}
