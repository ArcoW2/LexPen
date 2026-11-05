// LexPenShell.dll: LexPen's items in Explorer's right-click menu, each shown by what is selected
// (docs/plans/executed/PLAN-explorer-compare-two.md). Explorer commands (IExplorerCommand), each a class of its own that
// ExplorerMenu.cs registers for the current user, all in one place so they stay together:
//   Left:      one file or folder: "Select left side to compare" (with a left side: "Select as new left side ...").
//   CompareTo: one file or folder, a left side chosen and not this one: "Compare to <its name>".
//   Compare:   two files or folders (a file and a folder too: LexPen then finds the file in the folder).
//   Backups:   "Delete .bak file" (a file with a backup), "Delete all .bak files" (a folder).
//   Edit:      "Edit in LexPen", files only.
//   View:      "View in LexPen", files and folders.
//   Menu:      "LexPen", a submenu with the items above that are on (the setting explorerPlace "submenu").
// Explorer asks each command whether it shows (GetState, with the whole selection), its title and icon; a choice runs
// LexPen.exe as the registry entries did. What the commands need from LexPen is in HKCU\Software\Classes\LexPen.Shell:
// Exe (LexPen.exe), LeftFile (the file that holds the left side) and which items are on (Compare, Backups, Edit, View:
// 1 or 0). Read each time a menu opens, so a left side chosen a moment ago shows at once.

#define NOMINMAX   // std::min, not windows.h's macro
#include <windows.h>
#include <shobjidl_core.h>
#include <shlwapi.h>
#include <wrl/module.h>
#include <wrl/implements.h>
#include <algorithm>
#include <string>
#include <vector>

using namespace Microsoft::WRL;

extern "C" IMAGE_DOS_HEADER __ImageBase;   // this DLL's own module

namespace {

const wchar_t ConfigKey[] = L"Software\\Classes\\LexPen.Shell";

std::wstring ReadConfig(const wchar_t* name)
{
    wchar_t value[MAX_PATH * 2] = {};
    DWORD size = sizeof(value);
    if (RegGetValueW(HKEY_CURRENT_USER, ConfigKey, name, RRF_RT_REG_SZ, nullptr, value, &size) != ERROR_SUCCESS) return {};
    return value;
}

// An item that is on (Compare, Backups, Edit, View); not written: on.
bool On(const wchar_t* name)
{
    DWORD value = 1, size = sizeof(value);
    RegGetValueW(HKEY_CURRENT_USER, ConfigKey, name, RRF_RT_REG_DWORD, nullptr, &value, &size);
    return value != 0;
}

std::wstring Trim(std::wstring s)
{
    const wchar_t* space = L" \t\r\n";
    const auto first = s.find_first_not_of(space);
    if (first == std::wstring::npos) return {};
    return s.substr(first, s.find_last_not_of(space) - first + 1);
}

// The left side chosen (the text of LeftFile, UTF-8), or empty.
std::wstring Left()
{
    const auto file = ReadConfig(L"LeftFile");
    if (file.empty()) return {};
    const HANDLE h = CreateFileW(file.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
    if (h == INVALID_HANDLE_VALUE) return {};
    char bytes[MAX_PATH * 4] = {};
    DWORD read = 0;
    ReadFile(h, bytes, sizeof(bytes) - 1, &read, nullptr);
    CloseHandle(h);
    int start = read >= 3 && static_cast<unsigned char>(bytes[0]) == 0xEF ? 3 : 0;   // a byte order mark
    const int n = MultiByteToWideChar(CP_UTF8, 0, bytes + start, static_cast<int>(read) - start, nullptr, 0);
    std::wstring text(n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, bytes + start, static_cast<int>(read) - start, text.data(), n);
    return Trim(text);
}

bool Exists(const std::wstring& path) { return !path.empty() && GetFileAttributesW(path.c_str()) != INVALID_FILE_ATTRIBUTES; }

bool IsFolder(const std::wstring& path)
{
    const auto a = GetFileAttributesW(path.c_str());
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

std::wstring WithoutEndSlash(std::wstring p)
{
    while (p.size() > 3 && p.back() == L'\\') p.pop_back();
    return p;
}

bool SamePath(const std::wstring& a, const std::wstring& b) { return _wcsicmp(WithoutEndSlash(a).c_str(), WithoutEndSlash(b).c_str()) == 0; }

// How a left side is named in the menu: its file or folder name (a drive: as it is).
std::wstring NameOf(const std::wstring& path)
{
    const auto p = WithoutEndSlash(path);
    const auto at = p.find_last_of(L'\\');
    return at == std::wstring::npos || at + 1 == p.size() ? p : p.substr(at + 1);
}

// The file system paths of the selection; empty when any item is not a file or folder on disk.
std::vector<std::wstring> PathsOf(IShellItemArray* items)
{
    std::vector<std::wstring> paths;
    DWORD count = 0;
    if (!items || FAILED(items->GetCount(&count))) return paths;
    for (DWORD i = 0; i < count; i++)
    {
        ComPtr<IShellItem> item;
        PWSTR path = nullptr;
        if (FAILED(items->GetItemAt(i, &item)) || FAILED(item->GetDisplayName(SIGDN_FILESYSPATH, &path))) return {};
        paths.emplace_back(path);
        CoTaskMemFree(path);
    }
    return paths;
}

std::wstring Quoted(const std::wstring& s)
{
    // A path ending in \ (a drive) would escape the closing quote: \\ before it.
    return L"\"" + s + (s.empty() || s.back() != L'\\' ? L"" : L"\\") + L"\"";
}

std::wstring QuotedAll(const std::vector<std::wstring>& paths)
{
    std::wstring all;
    for (const auto& p : paths) all += L" " + Quoted(p);
    return all;
}

HRESULT Run(const std::wstring& args)
{
    const auto exe = ReadConfig(L"Exe");
    if (!Exists(exe)) return HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND);
    auto line = Quoted(exe) + L" " + args;
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi = {};
    AllowSetForegroundWindow(ASFW_ANY);   // LexPen may bring its window to the front
    if (!CreateProcessW(exe.c_str(), line.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi))
        return HRESULT_FROM_WIN32(GetLastError());
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return S_OK;
}

// The icon inside this DLL (LexPenShell.rc: 101 left side, 102 compare to, 103 compare), or LexPen's own (id 0).
HRESULT IconOf(int id, LPWSTR* icon)
{
    if (id == 0) return SHStrDupW((Quoted(ReadConfig(L"Exe")) + L",0").c_str(), icon);
    wchar_t dll[MAX_PATH] = {};
    GetModuleFileNameW(reinterpret_cast<HMODULE>(&__ImageBase), dll, MAX_PATH);
    return SHStrDupW((std::wstring(dll) + L",-" + std::to_wstring(id)).c_str(), icon);
}

enum class Kind { Left, CompareTo, Compare, Backups, Edit, View };

// One item; Kind says which. GetState hides it when the selection does not fit.
template <Kind K>
class Command : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand>
{
public:
    IFACEMETHODIMP GetTitle(IShellItemArray* items, LPWSTR* name) override
    {
        std::wstring title;
        if constexpr (K == Kind::Left) title = Exists(Left()) ? L"Select as new left side to compare" : L"Select left side to compare";
        else if constexpr (K == Kind::CompareTo) title = L"Compare to " + NameOf(Left());
        else if constexpr (K == Kind::Compare) title = L"Compare";
        else if constexpr (K == Kind::Backups)
        {
            const auto paths = PathsOf(items);
            const bool folder = std::any_of(paths.begin(), paths.end(), IsFolder);
            title = folder ? L"Delete all .bak files" : paths.size() > 1 ? L"Delete .bak files" : L"Delete .bak file";
        }
        else if constexpr (K == Kind::Edit) title = L"Edit in LexPen";
        else title = L"View in LexPen";
        return SHStrDupW(title.c_str(), name);
    }

    IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override
    {
        return IconOf(K == Kind::Left ? 101 : K == Kind::CompareTo ? 102 : K == Kind::Compare ? 103 : 0, icon);
    }

    IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override { *tip = nullptr; return E_NOTIMPL; }
    IFACEMETHODIMP GetCanonicalName(GUID* name) override { *name = GUID_NULL; return S_OK; }
    IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override { *flags = ECF_DEFAULT; return S_OK; }
    IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** commands) override { *commands = nullptr; return E_NOTIMPL; }

    IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override
    {
        *state = Shows(PathsOf(items)) ? ECS_ENABLED : ECS_HIDDEN;
        return S_OK;
    }

    static bool Shows(const std::vector<std::wstring>& paths)
    {
        if (paths.empty()) return false;
        if constexpr (K == Kind::Left) return paths.size() == 1;
        else if constexpr (K == Kind::CompareTo)
        {
            const auto left = Left();
            return paths.size() == 1 && Exists(left) && !SamePath(left, paths[0]);
        }
        else if constexpr (K == Kind::Compare) return paths.size() == 2;
        // A folder: always (finding its backups may take long); a file: when it has one.
        else if constexpr (K == Kind::Backups)
            return std::any_of(paths.begin(), paths.end(), [](const std::wstring& p) { return IsFolder(p) || Exists(p + L".bak"); });
        else if constexpr (K == Kind::Edit) return std::none_of(paths.begin(), paths.end(), IsFolder);
        else return true;
    }

    IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override
    {
        const auto paths = PathsOf(items);
        if (!Shows(paths)) return E_INVALIDARG;
        if constexpr (K == Kind::Left) return Run(L"--compare-left " + Quoted(paths[0]));
        else if constexpr (K == Kind::CompareTo) return Run(L"--compare " + Quoted(Left()) + L" " + Quoted(paths[0]));
        else if constexpr (K == Kind::Compare) return Run(L"--compare" + QuotedAll(paths));
        else if constexpr (K == Kind::Backups)
        {
            // One path each (--delete-backups takes one): a folder, or a file that has a backup.
            HRESULT hr = S_OK;
            for (const auto& p : paths)
                if (IsFolder(p) || Exists(p + L".bak")) hr = Run(L"--delete-backups " + Quoted(p));
            return hr;
        }
        else if constexpr (K == Kind::Edit) return Run(L"--edit" + QuotedAll(paths));
        else return Run(L"--view" + QuotedAll(paths));
    }
};

class DECLSPEC_UUID("E47540AF-B66D-4FAF-849E-D0B2D0D28E65") LeftCommand : public Command<Kind::Left> {};
class DECLSPEC_UUID("1658ED18-A409-45B4-B31F-C2E8895D23A9") CompareToCommand : public Command<Kind::CompareTo> {};
class DECLSPEC_UUID("367A334E-ECD6-4031-AC52-899B5F49C42C") CompareCommand : public Command<Kind::Compare> {};
class DECLSPEC_UUID("E7AAC44D-A969-408A-A62C-70F16630E17C") BackupsCommand : public Command<Kind::Backups> {};
class DECLSPEC_UUID("2C3C3546-DF09-4511-A0E3-C8BA1C799B73") EditCommand : public Command<Kind::Edit> {};
class DECLSPEC_UUID("944489B3-1E13-4BFD-86EA-3EDF8281BACA") ViewCommand : public Command<Kind::View> {};

// The items of the submenu, in the order of the menu between two lines (ExplorerMenu: the order of the key names).
class Items : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IEnumExplorerCommand>
{
public:
    Items()
    {
        if (On(L"Compare"))
        {
            list.push_back(Make<LeftCommand>());
            list.push_back(Make<CompareCommand>());
            list.push_back(Make<CompareToCommand>());
        }
        if (On(L"Backups")) list.push_back(Make<BackupsCommand>());
        if (On(L"Edit")) list.push_back(Make<EditCommand>());
        if (On(L"View")) list.push_back(Make<ViewCommand>());
    }

    IFACEMETHODIMP Next(ULONG count, IExplorerCommand** commands, ULONG* fetched) override
    {
        ULONG n = 0;
        for (; n < count && at < list.size(); n++, at++) list[at].CopyTo(&commands[n]);
        if (fetched) *fetched = n;
        return n == count ? S_OK : S_FALSE;
    }
    IFACEMETHODIMP Skip(ULONG count) override { at = std::min(list.size(), at + count); return at < list.size() ? S_OK : S_FALSE; }
    IFACEMETHODIMP Reset() override { at = 0; return S_OK; }
    IFACEMETHODIMP Clone(IEnumExplorerCommand** copy) override { *copy = nullptr; return E_NOTIMPL; }

    // Whether any item shows for these paths (the submenu itself shows only then).
    bool AnyShows(IShellItemArray* items)
    {
        for (const auto& c : list)
        {
            EXPCMDSTATE state = ECS_HIDDEN;
            if (SUCCEEDED(c->GetState(items, TRUE, &state)) && state != ECS_HIDDEN) return true;
        }
        return false;
    }

private:
    std::vector<ComPtr<IExplorerCommand>> list;
    size_t at = 0;
};

class DECLSPEC_UUID("136D8442-3780-48FE-9BB1-9C9D47F10E37") MenuCommand
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand>
{
public:
    IFACEMETHODIMP GetTitle(IShellItemArray*, LPWSTR* name) override { return SHStrDupW(L"LexPen", name); }
    IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override { return IconOf(0, icon); }
    IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override { *tip = nullptr; return E_NOTIMPL; }
    IFACEMETHODIMP GetCanonicalName(GUID* name) override { *name = GUID_NULL; return S_OK; }
    IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override { *flags = ECF_HASSUBCOMMANDS; return S_OK; }
    IFACEMETHODIMP Invoke(IShellItemArray*, IBindCtx*) override { return E_NOTIMPL; }

    IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override
    {
        *state = Make<Items>()->AnyShows(items) ? ECS_ENABLED : ECS_HIDDEN;
        return S_OK;
    }

    IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** commands) override
    {
        return Make<Items>().CopyTo(commands);
    }
};

CoCreatableClass(LeftCommand)
CoCreatableClass(CompareToCommand)
CoCreatableClass(CompareCommand)
CoCreatableClass(BackupsCommand)
CoCreatableClass(EditCommand)
CoCreatableClass(ViewCommand)
CoCreatableClass(MenuCommand)

}   // namespace

STDAPI DllGetClassObject(REFCLSID clsid, REFIID iid, void** object)
{
    return Module<InProc>::GetModule().GetClassObject(clsid, iid, object);
}

STDAPI DllCanUnloadNow()
{
    return Module<InProc>::GetModule().Terminate() ? S_OK : S_FALSE;
}
