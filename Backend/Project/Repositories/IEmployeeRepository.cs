using GatePassSystem.Project.Models;

namespace GatePassSystem.Project.Repositories;

public interface IEmployeeRepository
{
    Task<RequesterContext?> GetRequesterContextAsync(
        long userId,
        CancellationToken cancellationToken = default);
}

