-- Canonical URL, robots, Open Graph URL and JSON-LD for every page.
-- The domain comes from website.site-url in _quarto.yml (the only place it is set);
-- profile links come from _variables.yml.

local function stringify(value)
  if not value then
    return ""
  end
  return pandoc.utils.stringify(value)
end

local function read_yaml(name)
  local dir = quarto.project and quarto.project.directory
  if not dir then
    return nil
  end
  local f = io.open(pandoc.path.join({ dir, name }), "r")
  if not f then
    return nil
  end
  local text = f:read("a")
  f:close()
  return pandoc.read("---\n" .. text .. "\n---\n", "markdown").meta
end

local config = read_yaml("_quarto.yml") or {}
local vars = read_yaml("_variables.yml") or {}

local site_url = stringify(config.website and config.website["site-url"])
if site_url ~= "" and site_url:sub(-1) ~= "/" then
  site_url = site_url .. "/"
end
local site_name = stringify(config.website and config.website.title)

local function is_preview()
  local profiles = quarto.project and quarto.project.profile
  if profiles then
    for _, p in ipairs(profiles) do
      if stringify(p) == "preview" then
        return true
      end
    end
  end
  return (os.getenv("QUARTO_PROFILE") or ""):find("preview") ~= nil
end

-- index.qmd -> "", talks/x.qmd -> "talks/x.html", research/index.qmd -> "research/"
local function page_path()
  local input = quarto.doc.input_file
  local dir = quarto.project and quarto.project.directory
  if not input or not dir then
    return nil
  end
  local rel = pandoc.path.make_relative(input, dir):gsub("\\", "/")
  rel = rel:gsub("%.qmd$", ".html"):gsub("%.md$", ".html"):gsub("%.ipynb$", ".html")
  if rel == "index.html" then
    return ""
  end
  return (rel:gsub("/index%.html$", "/"))
end

local function same_as()
  local out = {}
  if vars.links then
    for _, key in ipairs({ "scholar", "orcid", "philpeople", "philsci", "linkedin", "github", "gc-profile" }) do
      local v = stringify(vars.links[key])
      if v ~= "" then
        table.insert(out, v)
      end
    end
  end
  return out
end

function Meta(meta)
  local head = {}

  local path = page_path()
  local canonical = stringify(meta.canonical)
  if canonical == "" and site_url ~= "" and path then
    canonical = site_url .. path
  end
  if canonical ~= "" then
    table.insert(head, string.format('<link rel="canonical" href="%s">', canonical))
    table.insert(head, string.format('<meta property="og:url" content="%s">', canonical))
    table.insert(head, string.format('<meta name="twitter:url" content="%s">', canonical))
  end

  local robots = stringify(meta.robots)
  if is_preview() then
    robots = "noindex, nofollow"
  elseif robots == "" then
    robots = "index, follow"
  end
  table.insert(head, string.format('<meta name="robots" content="%s">', robots))

  local seo_type = stringify(meta.seo_type)
  table.insert(head, string.format('<meta property="og:type" content="%s">', seo_type ~= "" and seo_type or "article"))
  table.insert(head, '<meta property="og:locale" content="en_US">')

  if site_url ~= "" then
    local person = {
      ["@type"] = "Person",
      ["@id"] = site_url .. "#person",
      name = stringify(vars.name) ~= "" and stringify(vars.name) or site_name,
      url = site_url,
      jobTitle = stringify(vars["job-title"]),
      worksFor = {
        ["@type"] = "CollegeOrUniversity",
        name = "Queens College, City University of New York",
        url = "https://www.qc.cuny.edu/",
      },
      affiliation = {
        ["@type"] = "CollegeOrUniversity",
        name = "CUNY Graduate Center",
        url = "https://www.gc.cuny.edu/",
      },
      sameAs = same_as(),
    }
    local graph = {
      {
        ["@type"] = "WebSite",
        ["@id"] = site_url .. "#website",
        url = site_url,
        name = site_name,
        inLanguage = "en",
        publisher = { ["@id"] = site_url .. "#person" },
      },
      person,
    }
    if canonical ~= "" then
      local webpage = {
        ["@type"] = "WebPage",
        ["@id"] = canonical,
        url = canonical,
        name = stringify(meta.title) ~= "" and stringify(meta.title) or site_name,
        isPartOf = { ["@id"] = site_url .. "#website" },
        inLanguage = "en",
      }
      local description = stringify(meta.description)
      if description ~= "" then
        webpage.description = description
      end
      table.insert(graph, webpage)
    end
    local json = quarto.json.encode({ ["@context"] = "https://schema.org", ["@graph"] = graph })
    table.insert(head, string.format('<script type="application/ld+json">%s</script>', json))
  end

  quarto.doc.include_text("in-header", table.concat(head, "\n"))
  return meta
end
