using System.Collections;
using System.Reflection;
using System.Text.Json;

internal static class NativeDesign
{
    private static readonly BindingFlags Members = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    internal static object Create(Assembly game, JsonElement design)
    {
        Type campaignType = game.GetType("Campaign", true)!;
        Type mapType = game.GetType("MapData", true)!;
        Type pointType = game.GetType("GridPoint", true)!;
        Type doodadType = game.GetType("DoodadInfo", true)!;
        Type triggerType = game.GetType("TriggerInfo", true)!;
        Type actionType = game.GetType("LevelEventActionInfo", true)!;
        object campaign = Activator.CreateInstance(campaignType)!;
        Set(campaign, "name", design.GetProperty("name"));
        var levelDesigns = design.GetProperty("levels").EnumerateArray().ToArray();
        if (levelDesigns.Length == 0) throw new InvalidDataException("A campaign needs at least one level.");
        Array levels = Array.CreateInstance(mapType, levelDesigns.Length);
        object Point(JsonElement xy)
        {
            int[] point = xy.EnumerateArray().Select(p => p.GetInt32()).ToArray();
            if (point.Length != 2) throw new InvalidDataException("A GridPoint needs exactly two coordinates.");
            return Activator.CreateInstance(pointType, point[0], point[1])!;
        }
        for (int index = 0; index < levelDesigns.Length; index++)
        {
            JsonElement level = levelDesigns[index];
            int width = level.GetProperty("width").GetInt32();
            int height = level.GetProperty("height").GetInt32();
            if (width <= 0 || height <= 0 || (long)width * height > 1_000_000)
                throw new InvalidDataException("Invalid level dimensions or map exceeds one million cells.");
            object map = Activator.CreateInstance(mapType, width, height)!;
            foreach (var setting in level.GetProperty("settings").EnumerateObject())
            {
                if (setting.Name is "width" or "height") continue;
                Set(map, setting.Name, setting.Value);
            }
            var terrainDesigns = level.GetProperty("terrain").EnumerateArray().ToArray();
            if (terrainDesigns.Any(r => r.GetProperty("layer").GetString() is not ("foreground" or "background")))
                throw new InvalidDataException("Terrain layer must be foreground or background.");
            foreach (string layer in new[] { "foreground", "background" })
            {
                var field = mapType.GetField(layer + "Blocks", Members)!;
                Type terrainType = field.FieldType.GetElementType()!;
                Array grid = Array.CreateInstance(terrainType, width, height);
                // TerrainType.Empty is zero; all newly allocated cells start empty.
                foreach (var rectangle in terrainDesigns)
                {
                    if (rectangle.GetProperty("layer").GetString() != layer) continue;
                    int[] bounds = rectangle.GetProperty("bounds").EnumerateArray().Select(x => x.GetInt32()).ToArray();
                    if (bounds.Length != 4 || bounds[0] < 0 || bounds[1] < 0 || bounds[2] >= width || bounds[3] >= height || bounds[0] > bounds[2] || bounds[1] > bounds[3])
                        throw new InvalidDataException("Terrain rectangle lies outside its map.");
                    object value = ConvertValue(terrainType, rectangle.GetProperty("type")) ?? throw new InvalidDataException("Terrain type cannot be null.");
                    for (int x = bounds[0]; x <= bounds[2]; x++)
                        for (int y = bounds[1]; y <= bounds[3]; y++)
                            grid.SetValue(value, x, y);
                }
                field.SetValue(map, grid);
            }
            IList doodads = (IList)mapType.GetProperty("DoodadList")!.GetValue(map)!;
            foreach (var placement in level.GetProperty("doodads").EnumerateArray())
            {
                int x = placement.GetProperty("x").GetInt32(), y = placement.GetProperty("y").GetInt32();
                if (x < 0 || y < 0 || x >= width || y >= height)
                    throw new InvalidDataException("Doodad position lies outside its map.");
                object position = Activator.CreateInstance(pointType, x, y)!;
                Type kindType = doodadType.GetField("type", Members)!.FieldType;
                object kind = ConvertValue(kindType, placement.GetProperty("type")) ?? throw new InvalidDataException("Doodad type cannot be null.");
                int variation = placement.TryGetProperty("variation", out var v) ? v.GetInt32() : 0;
                object doodad = Activator.CreateInstance(doodadType, position, kind, variation)!;
                if (placement.TryGetProperty("tag", out var tag)) Set(doodad, "tag", tag);
                if (placement.TryGetProperty("onlyInHardMode", out var hard)) Set(doodad, "onlyInHardMode", hard);
                doodads.Add(doodad);
            }
            IList triggers = (IList)mapType.GetProperty("TriggerList")!.GetValue(map)!;
            foreach (var triggerDesign in level.GetProperty("triggers").EnumerateArray())
            {
                object trigger = Activator.CreateInstance(triggerType)!;
                foreach (var setting in triggerDesign.GetProperty("fields").EnumerateObject()) Set(trigger, setting.Name, setting.Value);
                triggerType.GetField("bottomLeft", Members)!.SetValue(trigger, Point(triggerDesign.GetProperty("bottomLeft")));
                triggerType.GetField("upperRight", Members)!.SetValue(trigger, Point(triggerDesign.GetProperty("upperRight")));
                IList actions = (IList)triggerType.GetField("actions", Members)!.GetValue(trigger)!;
                foreach (var actionDesign in triggerDesign.GetProperty("actions").EnumerateArray())
                {
                    object action = Activator.CreateInstance(actionType)!;
                    foreach (var setting in actionDesign.GetProperty("fields").EnumerateObject()) Set(action, setting.Name, setting.Value);
                    if (actionDesign.TryGetProperty("pos", out var pos)) actionType.GetField("pos", Members)!.SetValue(action, Point(pos));
                    if (actionDesign.TryGetProperty("pos2", out var pos2)) actionType.GetField("pos2", Members)!.SetValue(action, Point(pos2));
                    actions.Add(action);
                }
                triggers.Add(trigger);
            }
            levels.SetValue(map, index);
        }
        campaignType.GetField("levels", Members)!.SetValue(campaign, levels);
        return campaign;
    }

    private static void Set(object target, string name, JsonElement value)
    {
        var field = target.GetType().GetField(name, Members) ?? throw new InvalidDataException($"Unknown native field {target.GetType().Name}.{name}");
        field.SetValue(target, ConvertValue(field.FieldType, value));
    }

    private static object? ConvertValue(Type type, JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Null) return null;
        if (type.IsEnum) return value.ValueKind == JsonValueKind.String ? Enum.Parse(type, value.GetString()!, false) : Enum.ToObject(type, value.GetInt32());
        if (type == typeof(string)) return value.GetString();
        if (type == typeof(bool)) return value.GetBoolean();
        if (type == typeof(int)) return value.GetInt32();
        if (type == typeof(float)) return value.GetSingle();
        throw new InvalidDataException($"Unsupported native scalar type {type.FullName}");
    }
}
