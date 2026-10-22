/*
 * Copyright (C) 2007-2026 Crafter Software Corporation. All Rights Reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as published by
 * the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package org.craftercms.studio.api.v2.dal;

import ch.vorburger.mariadb4j.DB;
import ch.vorburger.mariadb4j.DBConfigurationBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.apache.ibatis.type.JdbcType;
import org.craftercms.studio.api.v2.dal.item.LightItem;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Properties;
import java.util.Set;

import static java.util.stream.Collectors.toSet;
import static org.craftercms.studio.api.v1.constant.StudioConstants.CONTENT_TYPE_COMPONENT;
import static org.craftercms.studio.api.v1.constant.StudioConstants.CONTENT_TYPE_PAGE;
import static org.craftercms.studio.api.v2.dal.ItemState.LIVE;
import static org.craftercms.studio.api.v2.dal.ItemState.MODIFIED;
import static org.craftercms.studio.api.v2.dal.ItemState.NEW;
import static org.junit.Assert.assertEquals;

/**
 * Exercises {@link DependencyDAO#getHardDependenciesForList} against the hard-dependency query.
 * Item-specific dependencies are walked even when they are not modified, and only modified items
 * are returned.
 */
public class DependencyDAOTest {

	private static final String SITE_ID = "site";
	private static final String OTHER_SITE_ID = "other-site";
	private static final String TARGET = "live";
	private static final String DATABASE = "dependency_dao_test";
	private static final List<String> ITEM_SPECIFIC_PATTERNS = List.of("/site/components/.*");

	private static final String PAGE = "/site/website/index.xml";
	private static final String UNMODIFIED_COMPONENT = "/site/components/page/header.xml";
	private static final String NESTED_UNMODIFIED_COMPONENT = "/site/components/page/body.xml";
	private static final String MODIFIED_COMPONENT = "/site/components/page/nav.xml";
	private static final String DIRECT_MODIFIED_COMPONENT = "/site/components/page/footer.xml";
	private static final String PUBLISHED_PAGE = "/site/website/about.xml";
	private static final String NEW_PAGE = "/site/website/extra.xml";
	private static final String RENAMED_PAGE = "/site/website/moved.xml";
	private static final String PUBLISHED_ASSET = "/static-assets/images/logo.png";

	private static final long PUBLISHED = LIVE.value;
	private static final long EDITED = LIVE.value | MODIFIED.value;
	private static final long NEW_AND_MODIFIED = NEW.value | MODIFIED.value;

	private static DB database;
	private static DataSource dataSource;
	private static SqlSessionFactory sqlSessionFactory;
	private static long sitePk;

	@BeforeClass
	public static void startDatabase() throws Exception {
		DBConfigurationBuilder config = DBConfigurationBuilder.newBuilder();
		config.setPort(0);
		config.setSecurityDisabled(true);
		config.setDeletingTemporaryBaseAndDataDirsOnShutdown(true);
		database = DB.newEmbeddedDB(config.build());
		database.start();
		database.createDB(DATABASE);

		UnpooledDataSource unpooled = new UnpooledDataSource();
		unpooled.setDriver("org.mariadb.jdbc.Driver");
		unpooled.setUrl(config.getURL(DATABASE));
		unpooled.setUsername("root");
		unpooled.setPassword("");
		dataSource = unpooled;

		try (Connection connection = dataSource.getConnection()) {
			connection.setAutoCommit(true);
			try (Statement statement = connection.createStatement()) {
				for (String ddl : SCHEMA.split(";")) {
					if (!ddl.isBlank()) {
						statement.execute(ddl);
					}
				}
			}
			try (PreparedStatement insertSite = connection.prepareStatement(
					"INSERT INTO site (site_id, deleted) VALUES (?, 0)", Statement.RETURN_GENERATED_KEYS)) {
				insertSite.setString(1, SITE_ID);
				insertSite.executeUpdate();
				try (var keys = insertSite.getGeneratedKeys()) {
					keys.next();
					sitePk = keys.getLong(1);
				}
			}
		}

		sqlSessionFactory = new SqlSessionFactoryBuilder().build(mybatisConfiguration(dataSource));
	}

	@AfterClass
	public static void stopDatabase() throws Exception {
		if (database != null) {
			database.stop();
		}
	}

	@Before
	public void cleanTables() throws Exception {
		try (Connection connection = dataSource.getConnection();
			 Statement statement = connection.createStatement()) {
			statement.execute("DELETE FROM item_target");
			statement.execute("DELETE FROM dependency");
			statement.execute("DELETE FROM item");
		}
	}

	@Test
	public void includesModifiedItemSpecificDependencyOfUnmodifiedItemSpecificDependency() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(UNMODIFIED_COMPONENT, PUBLISHED, CONTENT_TYPE_COMPONENT);
		insertItem(NESTED_UNMODIFIED_COMPONENT, PUBLISHED, CONTENT_TYPE_COMPONENT);
		insertItem(MODIFIED_COMPONENT, EDITED, CONTENT_TYPE_COMPONENT);
		depend(PAGE, UNMODIFIED_COMPONENT);
		depend(UNMODIFIED_COMPONENT, NESTED_UNMODIFIED_COMPONENT);
		depend(NESTED_UNMODIFIED_COMPONENT, MODIFIED_COMPONENT);

		assertEquals(Set.of(MODIFIED_COMPONENT), hardDependencies(PAGE));
	}

	@Test
	public void excludesUnmodifiedItemSpecificDependency() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(UNMODIFIED_COMPONENT, PUBLISHED, CONTENT_TYPE_COMPONENT);
		depend(PAGE, UNMODIFIED_COMPONENT);

		assertEquals(Set.of(), hardDependencies(PAGE));
	}

	@Test
	public void includesDirectModifiedItemSpecificDependency() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(DIRECT_MODIFIED_COMPONENT, EDITED, CONTENT_TYPE_COMPONENT);
		depend(PAGE, DIRECT_MODIFIED_COMPONENT);

		assertEquals(Set.of(DIRECT_MODIFIED_COMPONENT), hardDependencies(PAGE));
	}

	@Test
	public void includesNewDependencyOfUnmodifiedItemSpecificDependency() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(UNMODIFIED_COMPONENT, PUBLISHED, CONTENT_TYPE_COMPONENT);
		insertItem(NEW_PAGE, NEW_AND_MODIFIED, CONTENT_TYPE_PAGE);
		depend(PAGE, UNMODIFIED_COMPONENT);
		depend(UNMODIFIED_COMPONENT, NEW_PAGE);

		assertEquals(Set.of(NEW_PAGE), hardDependencies(PAGE));
	}

	@Test
	public void doesNotTraverseUnmodifiedNonItemSpecificDependency() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(PUBLISHED_PAGE, PUBLISHED, CONTENT_TYPE_PAGE);
		insertItem(MODIFIED_COMPONENT, EDITED, CONTENT_TYPE_COMPONENT);
		depend(PAGE, PUBLISHED_PAGE);
		depend(PUBLISHED_PAGE, MODIFIED_COMPONENT);

		assertEquals(Set.of(), hardDependencies(PAGE));
	}

	@Test
	public void includesNewModifiedDependency() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(NEW_PAGE, NEW_AND_MODIFIED, CONTENT_TYPE_PAGE);
		depend(PAGE, NEW_PAGE);

		assertEquals(Set.of(NEW_PAGE), hardDependencies(PAGE));
	}

	@Test
	public void includesNewAndModifiedDependencies() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(NEW_PAGE, NEW.value, CONTENT_TYPE_PAGE);
		depend(PAGE, NEW_PAGE);

		assertEquals(Set.of(NEW_PAGE), hardDependencies(PAGE));
	}

	@Test
	public void includesModifiedItemSpecificDependencyOfRenamedItem() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		long renamedId = insertItem(RENAMED_PAGE, PUBLISHED, CONTENT_TYPE_PAGE);
		insertItem(MODIFIED_COMPONENT, EDITED, CONTENT_TYPE_COMPONENT);
		depend(PAGE, RENAMED_PAGE);
		depend(RENAMED_PAGE, MODIFIED_COMPONENT);
		markRenamed(renamedId, "/site/website/old.xml");

		assertEquals(Set.of(MODIFIED_COMPONENT), hardDependencies(PAGE));
	}

	@Test
	public void excludesModifiedDependencyThatIsNotItemSpecificOrNew() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(PUBLISHED_ASSET, EDITED, "asset");
		depend(PAGE, PUBLISHED_ASSET);

		assertEquals(Set.of(), hardDependencies(PAGE));
	}

	@Test
	public void doesNotFollowInvalidDependencies() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(UNMODIFIED_COMPONENT, PUBLISHED, CONTENT_TYPE_COMPONENT);
		insertItem(MODIFIED_COMPONENT, EDITED, CONTENT_TYPE_COMPONENT);
		depend(PAGE, UNMODIFIED_COMPONENT, false);
		depend(UNMODIFIED_COMPONENT, MODIFIED_COMPONENT);

		assertEquals(Set.of(), hardDependencies(PAGE));
	}

	@Test
	public void doesNotReturnTheRequestedPath() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(DIRECT_MODIFIED_COMPONENT, EDITED, CONTENT_TYPE_COMPONENT);
		insertItem(MODIFIED_COMPONENT, EDITED, CONTENT_TYPE_COMPONENT);
		depend(PAGE, DIRECT_MODIFIED_COMPONENT);
		depend(PAGE, MODIFIED_COMPONENT);

		assertEquals(Set.of(MODIFIED_COMPONENT), hardDependencies(PAGE, DIRECT_MODIFIED_COMPONENT));
	}

	@Test
	public void ignoresDependenciesRecordedForAnotherSite() throws Exception {
		insertItem(PAGE, EDITED, CONTENT_TYPE_PAGE);
		insertItem(DIRECT_MODIFIED_COMPONENT, EDITED, CONTENT_TYPE_COMPONENT);
		depend(OTHER_SITE_ID, PAGE, DIRECT_MODIFIED_COMPONENT, true);

		assertEquals(Set.of(), hardDependencies(PAGE));
	}

	private static Set<String> hardDependencies(String... paths) {
		try (SqlSession session = sqlSessionFactory.openSession()) {
			DependencyDAO dao = session.getMapper(DependencyDAO.class);
			return dao.getHardDependenciesForList(SITE_ID, TARGET, List.of(paths), ITEM_SPECIFIC_PATTERNS, true)
					.stream()
					.map(LightItem::getPath)
					.collect(toSet());
		}
	}

	private static long insertItem(String path, long state, String systemType) throws Exception {
		try (Connection connection = dataSource.getConnection();
			 PreparedStatement statement = connection.prepareStatement(
					 "INSERT INTO item (site_id, path, state, system_type, label, mime_type) VALUES (?, ?, ?, ?, ?, ?)",
					 Statement.RETURN_GENERATED_KEYS)) {
			statement.setLong(1, sitePk);
			statement.setString(2, path);
			statement.setLong(3, state);
			statement.setString(4, systemType);
			statement.setString(5, path);
			statement.setString(6, "application/xml");
			statement.executeUpdate();
			try (var keys = statement.getGeneratedKeys()) {
				keys.next();
				return keys.getLong(1);
			}
		}
	}

	private static void depend(String sourcePath, String targetPath) throws Exception {
		depend(SITE_ID, sourcePath, targetPath, true);
	}

	private static void depend(String sourcePath, String targetPath, boolean valid) throws Exception {
		depend(SITE_ID, sourcePath, targetPath, valid);
	}

	private static void depend(String siteId, String sourcePath, String targetPath, boolean valid) throws Exception {
		try (Connection connection = dataSource.getConnection();
			 PreparedStatement statement = connection.prepareStatement(
					 "INSERT INTO dependency (site, source_path, target_path, type, valid) VALUES (?, ?, ?, ?, ?)")) {
			statement.setString(1, siteId);
			statement.setString(2, sourcePath);
			statement.setString(3, targetPath);
			statement.setString(4, "component");
			statement.setInt(5, valid ? 1 : 0);
			statement.executeUpdate();
		}
	}

	private static void markRenamed(long itemId, String previousPath) throws Exception {
		try (Connection connection = dataSource.getConnection();
			 PreparedStatement statement = connection.prepareStatement(
					 "INSERT INTO item_target (item_id, target, previous_path, published_commit_id) VALUES (?, ?, ?, ?)")) {
			statement.setLong(1, itemId);
			statement.setString(2, TARGET);
			statement.setString(3, previousPath);
			statement.setString(4, "commit");
			statement.executeUpdate();
		}
	}

	private static Configuration mybatisConfiguration(DataSource dataSource) {
		Configuration configuration = new Configuration(new Environment("test", new JdbcTransactionFactory(), dataSource));
		configuration.setMapUnderscoreToCamelCase(true);
		configuration.setJdbcTypeForNull(JdbcType.VARCHAR);
		configuration.setVariables(mapperVariables());
		configuration.addMapper(UserDAO.class);
		configuration.addMapper(ItemDAO.class);
		configuration.addMapper(DependencyDAO.class);
		return configuration;
	}

	private static Properties mapperVariables() {
		Properties variables = new Properties();
		variables.setProperty("liveEnvironment", "live");
		variables.setProperty("stagingEnvironment", "staging");
		variables.setProperty("packageReadyState", "1");
		variables.setProperty("packageApprovedState", "APPROVED");
		variables.setProperty("livePublishedState", "4");
		variables.setProperty("stagingPublishedState", "16");
		variables.setProperty("systemTypeFolder", "folder");
		variables.setProperty("systemTypePage", CONTENT_TYPE_PAGE);
		variables.setProperty("systemTypeLevelDescriptor", "levelDescriptor");
		variables.setProperty("systemProcessingState", "16");
		variables.setProperty("blobFilePattern", "%.blob");
		return variables;
	}

	private static final String SCHEMA = """
			CREATE TABLE site (
				id BIGINT NOT NULL AUTO_INCREMENT,
				site_id VARCHAR(50) NOT NULL,
				deleted INT NOT NULL DEFAULT 0,
				PRIMARY KEY (id)
			);
			CREATE TABLE item (
				id BIGINT NOT NULL AUTO_INCREMENT,
				site_id BIGINT NOT NULL,
				path VARCHAR(2048) NOT NULL,
				state BIGINT NOT NULL,
				system_type VARCHAR(64) NULL,
				label VARCHAR(256) NULL,
				mime_type VARCHAR(96) NULL,
				parent_id BIGINT NULL,
				PRIMARY KEY (id)
			);
			CREATE TABLE dependency (
				id BIGINT NOT NULL AUTO_INCREMENT,
				site VARCHAR(50) NOT NULL,
				source_path TEXT NOT NULL,
				target_path TEXT NOT NULL,
				type VARCHAR(50) NOT NULL,
				valid BIT NOT NULL DEFAULT 1,
				PRIMARY KEY (id)
			);
			CREATE TABLE item_target (
				item_id BIGINT NOT NULL,
				target VARCHAR(20) NOT NULL,
				previous_path VARCHAR(2048) NULL,
				published_commit_id VARCHAR(40) NOT NULL,
				PRIMARY KEY (item_id, target)
			);
			""";
}
