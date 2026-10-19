namespace LexPen.Tests;

public class ImageLinksTests : IDisposable
{
    readonly string root = Path.Combine(Path.GetTempPath(), "LexPen.Images." + Guid.NewGuid().ToString("N"));
    readonly string docDir, doc, outside;

    public ImageLinksTests()
    {
        docDir = Path.Combine(root, "docs");
        outside = Path.Combine(root, "other place");
        Directory.CreateDirectory(Path.Combine(docDir, "img"));
        Directory.CreateDirectory(outside);
        doc = Path.Combine(docDir, "readme.md");
        File.WriteAllText(doc, "# x");
    }

    public void Dispose() => Directory.Delete(root, true);

    string Image(string folder, string name)
    {
        var path = Path.Combine(folder, name);
        File.WriteAllBytes(path, [1, 2, 3]);
        return path;
    }

    [Fact]
    public void AnImageBelowTheDocumentIsLinkedWhereItIs()
    {
        var image = Image(Path.Combine(docDir, "img"), "a b.png");
        Assert.Equal("![a b](img/a%20b.png)", ImageLinks.Place(doc, image, "auto"));
        Assert.False(Directory.Exists(ImageLinks.ImagesFolder(doc)));
    }

    [Fact]
    public void AnImageElsewhereIsCopiedToTheImageFolder()
    {
        var image = Image(outside, "pic.png");
        Assert.Equal("![pic](readme.md.images/pic.png)", ImageLinks.Place(doc, image, "auto"));
        Assert.True(File.Exists(Path.Combine(docDir, "readme.md.images", "pic.png")));
        Assert.True(File.Exists(image));   // copied, not moved
    }

    [Fact]
    public void ACopyDoesNotOverwrite()
    {
        Directory.CreateDirectory(ImageLinks.ImagesFolder(doc));
        File.WriteAllBytes(Path.Combine(ImageLinks.ImagesFolder(doc), "pic.png"), [9]);
        var image = Image(outside, "pic.png");
        Assert.Equal("![pic-2](readme.md.images/pic-2.png)", ImageLinks.Place(doc, image, "auto"));
    }

    [Fact]
    public void ShiftChoices()
    {
        var image = Image(outside, "pic.png");
        Assert.Equal("![pic](../other%20place/pic.png)", ImageLinks.Place(doc, image, "relative"));
        Assert.Equal($"![pic]({image.Replace('\\', '/').Replace(" ", "%20")})", ImageLinks.Place(doc, image, "absolute"));
        Assert.Equal("![pic](pic.png)", ImageLinks.Place(doc, image, "copyHere"));
        Assert.True(File.Exists(Path.Combine(docDir, "pic.png")));
        Assert.Equal("![pic](readme.md.images/pic.png)", ImageLinks.Place(doc, image, "copyImages"));
    }

    [Fact]
    public void CopyingAnImageThatIsAlreadyThereDoesNothing()
    {
        var here = Image(docDir, "here.png");
        Assert.Equal("![here](here.png)", ImageLinks.Place(doc, here, "copyHere"));
        Assert.Single(Directory.GetFiles(docDir, "here*"));
    }

    [Fact]
    public void AbsoluteLinksKeepTheDrive()
    {
        Assert.Equal("D:/my%20docs/x%281%29.png", ImageLinks.Absolute(@"D:\my docs\x(1).png"));
    }

    [Fact]
    public void NoRelativePathAcrossDrives()
    {
        Assert.Null(ImageLinks.Relative(@"C:\docs", @"D:\x.png"));
    }

    [Fact]
    public void APastedPictureGoesToTheImageFolder()
    {
        var markdown = ImageLinks.SavePicture(doc, [1, 2], new DateTime(2026, 10, 16, 20, 15, 0));
        Assert.Equal("![image-20261016-201500](readme.md.images/image-20261016-201500.png)", markdown);
    }

    [Fact]
    public void OnlyImagesAreImages()
    {
        Assert.True(ImageLinks.IsImage(@"C:\a\B.PNG"));
        Assert.False(ImageLinks.IsImage(@"C:\a\b.md"));
    }
}
