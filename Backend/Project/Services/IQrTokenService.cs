namespace FormRequestSystem.Project.Services;

public interface IQrTokenService
{
    string CreateToken(long gatePassId);
    string CreateEmployeeToken(long employeeRecordId);
    bool TryGetEmployeeRecordId(string token, out long employeeRecordId);
    string HashToken(string token);
}


