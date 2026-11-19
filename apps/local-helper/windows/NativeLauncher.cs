using System;
using System.IO;
using System.Diagnostics;
using System.Threading.Tasks;

public class OctaBlasterNativeLauncher {
  public static int Main() {
    try {
      string directory = AppDomain.CurrentDomain.BaseDirectory;
      string node = File.ReadAllText(Path.Combine(directory, "node.path")).Trim();
      var start = new ProcessStartInfo(node, "\"" + Path.Combine(directory, "native-host.mjs") + "\"");
      start.WorkingDirectory = directory;
      start.UseShellExecute = false;
      start.CreateNoWindow = true;
      start.RedirectStandardInput = true;
      start.RedirectStandardOutput = true;
      start.RedirectStandardError = true;
      using (var child = Process.Start(start)) {
        var incoming = Task.Run(() => {
          try {
            var source = Console.OpenStandardInput(); var target = child.StandardInput.BaseStream;
            byte[] buffer = new byte[8192]; int count;
            while ((count = source.Read(buffer, 0, buffer.Length)) > 0) { target.Write(buffer, 0, count); target.Flush(); }
          } catch {} finally { try { child.StandardInput.Close(); } catch {} }
        });
        var outgoing = Task.Run(() => {
          var source = child.StandardOutput.BaseStream; var target = Console.OpenStandardOutput();
          byte[] buffer = new byte[8192]; int count;
          while ((count = source.Read(buffer, 0, buffer.Length)) > 0) { target.Write(buffer, 0, count); target.Flush(); }
        });
        var errors = Task.Run(() => child.StandardError.BaseStream.CopyTo(Stream.Null));
        child.WaitForExit();
        outgoing.Wait();
        return child.ExitCode;
      }
    } catch { return 1; }
  }
}
