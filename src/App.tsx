import Hero from "./sections/Hero";
import About from "./sections/About";
import FeaturedSteddi from "./sections/FeaturedSteddi";
import Projects from "./sections/Projects";
import Resume from "./sections/Resume";
import Poetry from "./sections/Poetry";
import Contact from "./sections/Contact";
import Stats from "./sections/Stats";
import Gallery from "./sections/Gallery";
import Nav from "./components/Nav";
import GridBg from "./components/GridBg";
function SectionDivider() {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="w-px h-16" style={{
        background: "linear-gradient(180deg, transparent, var(--border-hover), transparent)",
      }} />
    </div>
  );
}

export default function App() {
  const isGallery =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("gallery");

  if (isGallery) {
    return <Gallery />;
  }

  return (
    <div className="relative">
      <GridBg />
      <Nav />
      <main>
        <Hero />
        <SectionDivider />
        <About />
        <SectionDivider />
        <FeaturedSteddi />
        <SectionDivider />
        <Projects />
        <Stats />
        <Resume />
        <SectionDivider />
        <Poetry />
        <SectionDivider />
        <Contact />
      </main>
    </div>
  );
}
