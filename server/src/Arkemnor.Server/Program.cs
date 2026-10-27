var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new
{
    service = "arkemnor-server",
    status = "ok"
}));

app.Run();
