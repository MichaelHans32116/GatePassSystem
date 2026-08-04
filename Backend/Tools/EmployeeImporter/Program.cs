namespace FormRequestSystem.EmployeeImporter;

internal static class Program
{
    private const int RetiredToolExitCode = 2;

    private static int Main()
    {
        Console.Error.WriteLine(
            "EmployeeImporter is retired and intentionally performs no database or HTTP actions.");
        Console.Error.WriteLine(
            "Use the reviewed database setup/import workflow documented by IT instead.");
        return RetiredToolExitCode;
    }
}
