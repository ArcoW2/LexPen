// LexPenShell.dll: LexPen's compare items in Explorer's right-click menu, by what is selected
// (docs/plans/40-PLAN-explorer-compare-two.md). Three Explorer commands (IExplorerCommand), each a class of its own
// that ExplorerMenu.cs registers for the current user:
//   Left:      one file or folder: "Select left side to compare" (with a left side: "Select as new left side ...").
//   CompareTo: one file or folder, a left side chosen and not this one: "Compare to <its name>".
//   Compare:   two files or folders (a file and a folder too: LexPen then finds the file in the folder).
// Explorer asks each command whether it shows (GetState, with the whole selection), its title and icon; a choice runs
// LexPen.exe as the registry entries did: --compare-left <path>, --compare <left> <path>, --compare <a> <b>. What the
// commands need from LexPen is in HKCU\Software\Classes\LexPen.Shell: Exe (LexPen.exe) and LeftFile (the file that
// holds the left side). Read each time a menu opens, so a left side chosen a moment ago shows at once.

#include <windows.h>
#include <shobjidl_core.h>
#include <shlwapi.h>
#include <wrl/module.h>
#include <wrl/implements.h>
#include <string>
#include <vector>

using namespace Microsoft::WRL;

namespace {

const wchar_t ConfigKey[] = L"Software\\Classes\\LexPen.Shell";

std::wstring ReadConfig(const wchar_t* name)
{
    wchar_t value[MAX_PATH * 2] = {};
    DWORD size = sizeof(value);
    if (RegGetValueW(HKEY_CURRENT_USER, ConfigKey, name, RRF_RT_REG_SZ, nullptr, value, &size) != ERROR_SUCCESS) return {};
    return value;
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

enum class Kind { Left, CompareTo, Compare };

// One command; Kind says which. GetState hides it when the selection does not fit.
template <Kind K>
class Command : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand>
{
public:
    IFACEMETHODIMP GetTitle(IShellItemArray*, LPWSTR* name) override
    {
        std::wstring title;
        if constexpr (K == Kind::Left) title = Exists(Left()) ? L"Select as new left side to compare" : L"Select left side to compare";
        else if constexpr (K == Kind::CompareTo) title = L"Compare to " + NameOf(Left());
        else title = L"Compare";
        return SHStrDupW(title.c_str(), name);
    }

    IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override
    {
        const auto exe = ReadConfig(L"Exe");
        const auto dir = exe.substr(0, exe.find_last_of(L'\\') + 1);
        return SHStrDupW((dir + (K == Kind::Left ? L"compare-left.ico" : L"compare-to.ico")).c_str(), icon);
    }

    IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override { *tip = nullptr; return E_NOTIMPL; }
    IFACEMETHODIMP GetCanonicalName(GUID* name) override { *name = GUID_NULL; return S_OK; }
    IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override { *flags = ECF_DEFAULT; return S_OK; }
    IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** commands) override { *commands = nullptr; return E_NOTIMPL; }

    IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override
    {
        const auto paths = PathsOf(items);
        bool show = false;
        if constexpr (K == Kind::Left) show = paths.size() == 1;
        else if constexpr (K == Kind::CompareTo)
        {
            const auto left = Left();
            show = paths.size() == 1 && Exists(left) && !SamePath(left, paths[0]);
        }
        else show = paths.size() == 2;
        *state = show ? ECS_ENABLED : ECS_HIDDEN;
        return S_OK;
    }

    IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override
    {
        const auto paths = PathsOf(items);
        if constexpr (K == Kind::Left) return paths.size() == 1 ? Run(L"--compare-left " + Quoted(paths[0])) : E_INVALIDARG;
        else if constexpr (K == Kind::CompareTo)
        {
            const auto left = Left();
            return paths.size() == 1 && !left.empty() ? Run(L"--compare " + Quoted(left) + L" " + Quoted(paths[0])) : E_INVALIDARG;
        }
        else return paths.size() == 2 ? Run(L"--compare " + Quoted(paths[0]) + L" " + Quoted(paths[1])) : E_INVALIDARG;
    }
};

class DECLSPEC_UUID("E47540AF-B66D-4FAF-849E-D0B2D0D28E65") LeftCommand : public Command<Kind::Left> {};
class DECLSPEC_UUID("1658ED18-A409-45B4-B31F-C2E8895D23A9") CompareToCommand : public Command<Kind::CompareTo> {};
class DECLSPEC_UUID("367A334E-ECD6-4031-AC52-899B5F49C42C") CompareCommand : public Command<Kind::Compare> {};

CoCreatableClass(LeftCommand)
CoCreatableClass(CompareToCommand)
CoCreatableClass(CompareCommand)

}   // namespace

STDAPI DllGetClassObject(REFCLSID clsid, REFIID iid, void** object)
{
    return Module<InProc>::GetModule().GetClassObject(clsid, iid, object);
}

STDAPI DllCanUnloadNow()
{
    return Module<InProc>::GetModule().Terminate() ? S_OK : S_FALSE;
}
