namespace SAM.Game.Wpf.Models
{
    internal class AchievementItem
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public bool Unlocked { get; set; }
        public string IconUrl { get; set; }
        public string UnlockTime { get; set; }
        public bool OriginalUnlocked { get; set; }
        public bool IsModified => Unlocked != OriginalUnlocked;
    }
}
