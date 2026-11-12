using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text.Json;
using System.Xml.Serialization;

// Host only the managed data serializers. No Unity player is launched.
// Method/type identity and compatibility remain bound to the supplied game build.
internal static class Program
{
    private static readonly BindingFlags Static = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;

    private static int Main(string[] args)
    {
        try
        {
            var options = new Dictionary<string, string>();
            for (int i = 0; i < args.Length; i += 2)
                options.Add(args[i], args[i + 1]);
            if (options.TryGetValue("--assembly-identity", out string? identityPath))
            {
                using var stream = File.OpenRead(identityPath);
                using var pe = new PEReader(stream);
                var metadata = pe.GetMetadataReader();
                string mvid = metadata.GetGuid(metadata.GetModuleDefinition().Mvid).ToString("D");
                Console.WriteLine(JsonSerializer.Serialize(new { mvid, sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(identityPath))).ToLowerInvariant() }));
                return 0;
            }
            string managed = Path.GetFullPath(options["--managed"]);
            string output = Path.GetFullPath(options.GetValueOrDefault("--output", "runtime/catalog.json"));
            if (!options.ContainsKey("--catalog") && options.ContainsKey("--input") == options.ContainsKey("--design"))
                throw new ArgumentException("Supply exactly one of --input BFC or --design JSON.");
            AssemblyLoadContext.Default.Resolving += (_, name) =>
            {
                string candidate = Path.Combine(managed, name.Name + ".dll");
                // Framework references must resolve to this host's compatibility assemblies.
                if (name.Name is "mscorlib" or "System" or "System.Core" or "System.Xml") return null;
                return File.Exists(candidate) ? AssemblyLoadContext.Default.LoadFromAssemblyPath(candidate) : null;
            };
            string assemblyPath = Path.Combine(managed, "Assembly-CSharp.dll");
            Assembly game = AssemblyLoadContext.Default.LoadFromAssemblyPath(assemblyPath);
            if (options.ContainsKey("--catalog"))
            {
                var types = new[] { "MapData", "DoodadInfo", "TriggerInfo", "LevelEventActionInfo" };
                var fields = types.ToDictionary(name => name, name => game.GetType(name, true)!
                    .GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
                    .Where(f => f.FieldType.IsEnum || f.FieldType.IsPrimitive || f.FieldType == typeof(string))
                    .ToDictionary(f => f.Name, f => (object)new { type = f.FieldType.Name,
                        values = f.FieldType.IsEnum ? Enum.GetNames(f.FieldType).ToDictionary(n => n, n => Convert.ToInt64(Enum.Parse(f.FieldType, n))) : null }));
                Console.WriteLine(JsonSerializer.Serialize(new { fields, gameAssemblySha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(assemblyPath))).ToLowerInvariant() }));
                return 0;
            }
            Type campaignType = game.GetType("Campaign", true)!;
            Type headerType = game.GetType("CampaignHeader", true)!;
            Type ioType = game.GetType("FileIO", true)!;
            object campaign;
            if (options.TryGetValue("--design", out string? designPath))
            {
                using var document = JsonDocument.Parse(File.ReadAllText(designPath));
                campaign = NativeDesign.Create(game, document.RootElement);
            }
            else
            {
                campaign = Activator.CreateInstance(campaignType)!;
                byte[] source = File.ReadAllBytes(Path.GetFullPath(options["--input"]));
                using var reader = new BinaryReader(new MemoryStream(source));
                if (reader.ReadUInt32() != 0x907f0a4a) throw new InvalidDataException("Expected native Campaign.Serialize format 0x907f0a4a.");
                campaignType.GetMethod("Deserialize", new[] { typeof(BinaryReader) })!.Invoke(campaign, new object[] { reader });
                if (reader.BaseStream.Position != reader.BaseStream.Length) throw new InvalidDataException("Native campaign reader left trailing bytes.");
            }
            object header = campaignType.GetField("header")!.GetValue(campaign) ?? Activator.CreateInstance(headerType)!;
            campaignType.GetField("header")!.SetValue(campaign, header);
            void Set(string name, object value) => headerType.GetField(name)!.SetValue(header, value);
            Set("name", options.GetValueOrDefault("--name", (string?)campaignType.GetField("name")!.GetValue(campaign) ?? "Untitled campaign"));
            Set("author", options.GetValueOrDefault("--author", "Jai"));
            Set("description", options.GetValueOrDefault("--description", "A brief descent from the high ground into burning Hell terrain."));
            Set("isPublished", true);
            Set("hasTimeScoreBoard", false);
            Set("hasBrotalityScoreboard", false);
            string? editableOutput = options.GetValueOrDefault("--editable-output");
            if (options.ContainsKey("--design") && editableOutput == null) editableOutput = Path.ChangeExtension(output, ".bfc");
            if (editableOutput != null && Path.GetFullPath(editableOutput) == output)
                throw new ArgumentException("Editable and published output paths must differ.");
            byte[] editable = (byte[])ioType.GetMethod("SerializeCampaignBinary", Static)!.Invoke(null, new object[] { campaign, true })!;
            // Verify that the native binary reader consumes the native writer's entire output.
            object editableRoundTrip = Activator.CreateInstance(campaignType)!;
            using (var reader = new BinaryReader(new MemoryStream(editable)))
            {
                if (reader.ReadUInt32() != 0x907f0a4a) throw new InvalidDataException("Unexpected native editable signature.");
                campaignType.GetMethod("Deserialize", new[] { typeof(BinaryReader) })!.Invoke(editableRoundTrip, new object[] { reader });
                if (reader.BaseStream.Position != reader.BaseStream.Length) throw new InvalidDataException("Native editable round trip left bytes.");
            }
            var serialize = ioType.GetMethod("SerializeCampaign", Static)!;
            byte[] result = (byte[])serialize.Invoke(null, new object[] { campaign, true, true })!;
            int separator = Array.IndexOf(result, (byte)31);
            if (separator < 0) throw new InvalidDataException("Native published envelope lacks its header separator.");
            object decodedHeader;
            using (var stream = new MemoryStream(result, 0, separator))
                decodedHeader = new XmlSerializer(headerType).Deserialize(stream)!;
            string md5 = (string)headerType.GetField("md5")!.GetValue(decodedHeader)!;
            byte[] encrypted = result[(separator + 1)..];
            byte[] compressed = (byte[])ioType.GetMethod("DecryptBlob", Static)!.Invoke(null, new object[] { encrypted, md5 })!;
            string recomputed = (string)ioType.GetMethod("ComputeMD5", Static)!.Invoke(null, new object[] { decodedHeader, compressed })!;
            if (md5 != recomputed) throw new InvalidDataException("Native checksum verification failed.");
            Type lzf = game.GetType("CLZF2", true)!;
            byte[] xml = (byte[])lzf.GetMethod("Decompress", Static, null, new[] { typeof(byte[]) }, null)!.Invoke(null, new object[] { compressed })!;
            object decoded;
            using (var stream = new MemoryStream(xml))
                decoded = new XmlSerializer(campaignType).Deserialize(stream)!;
            Array levels = (Array)campaignType.GetField("levels")!.GetValue(decoded)!;
            if (levels.Length != (int)headerType.GetField("length")!.GetValue(decodedHeader)!)
                throw new InvalidDataException("Header/campaign length mismatch.");
            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            File.WriteAllBytes(output, result);
            if (editableOutput != null)
            {
                editableOutput = Path.GetFullPath(editableOutput);
                Directory.CreateDirectory(Path.GetDirectoryName(editableOutput)!);
                File.WriteAllBytes(editableOutput, editable);
            }
            Console.WriteLine(JsonSerializer.Serialize(new
            {
                output, bytes = result.Length, sha256 = Convert.ToHexString(SHA256.HashData(result)).ToLowerInvariant(),
                gameAssemblySha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(assemblyPath))).ToLowerInvariant(),
                gameMvid = game.ManifestModule.ModuleVersionId, levels = levels.Length,
                nativeApi = options.ContainsKey("--design")
                    ? "native Campaign/MapData/GridPoint/DoodadInfo/TriggerInfo/LevelEventActionInfo construction -> FileIO.SerializeCampaignBinary(true) + SerializeCampaign(true,true)"
                    : "Campaign.Deserialize -> FileIO.SerializeCampaign(true,true)",
                editableOutput,
                editableSha256 = Convert.ToHexString(SHA256.HashData(editable)).ToLowerInvariant(),
                validation = "native editable round trip, decrypt, checksum, decompression, and XML deserialization passed",
                runtime = "not tested in Unity; no engine started"
            }, new JsonSerializerOptions { WriteIndented = true }));
            return 0;
        }
        catch (Exception error)
        {
            while (error is TargetInvocationException && error.InnerException != null) error = error.InnerException;
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}
